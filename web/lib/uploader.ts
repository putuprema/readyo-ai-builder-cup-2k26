import type { SourceKind } from "@adidi/shared";
import { firestorePaths } from "@adidi/shared";
import { doc, updateDoc } from "firebase/firestore";
import { API_URL, ApiError, apiFetch } from "./api";
import type { AcceptedType } from "./documents";
import { firebaseAuth, firestore } from "./firebase";

// How the documents step stores a file (spec 10, "Documents step"): POST /uploads gives a
// `documents` record and a URL to PUT the bytes to (a Cloud Storage V4 signed URL, or on the
// emulators the api's own content route), the browser PUTs the file with progress, then marks
// the record uploaded. Nothing is read before Submit. DELETE /uploads/:docId removes a file.

export interface UploadRequest {
  file: File;
  type: AcceptedType;
  sourceKind: SourceKind;
  month: string;
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
}

export interface Uploader {
  /** Stores the file and resolves with the `documents` record id. */
  upload(request: UploadRequest): Promise<{ docId: string }>;
  /** Deletes the file and its record. */
  remove(docId: string): Promise<void>;
}

interface CreateUploadResponse {
  docId: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export const apiUploader: Uploader = {
  async upload({ file, type, sourceKind, month, onProgress, signal }) {
    const created = await apiFetch<CreateUploadResponse>("/uploads", {
      method: "POST",
      body: { name: file.name, type, size: file.size, sourceKind, month },
      signal,
    });
    await putFile(created, file, onProgress, signal);
    const user = firebaseAuth().currentUser;
    if (user) {
      // The api already marks the record on its proxy route; a signed URL goes straight to
      // the bucket, so the browser records the completed upload itself (owner write).
      await updateDoc(doc(firestore(), firestorePaths.document(user.uid, created.docId)), {
        status: "uploaded",
      });
    }
    return { docId: created.docId };
  },
  async remove(docId) {
    await apiFetch<void>(`/uploads/${docId}`, { method: "DELETE" });
  },
};

/** The person changed a file's source kind after picking it: fix the record (owner write). */
export async function setDocumentKind(docId: string, sourceKind: SourceKind): Promise<void> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new ApiError(401, "unauthorized", "Sign in first");
  await updateDoc(doc(firestore(), firestorePaths.document(user.uid, docId)), { sourceKind });
}

/** PUT with upload progress; XMLHttpRequest because fetch has no upload progress events. */
async function putFile(
  target: CreateUploadResponse,
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = { ...target.headers };
  if (target.uploadUrl.startsWith(API_URL)) {
    // The api's own route (emulators) is behind the usual bearer-token check.
    const user = firebaseAuth().currentUser;
    if (!user) throw new ApiError(401, "unauthorized", "Sign in first");
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.uploadUrl);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new ApiError(xhr.status, `upload_${xhr.status}`, uploadErrorMessage(xhr.status)));
      }
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "network", "The upload was interrupted. Check your connection."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

function uploadErrorMessage(status: number): string {
  if (status === 403) return "The upload link expired. Remove the file and add it again.";
  if (status === 413) return "The file is too large.";
  return "The storage service refused the file.";
}
