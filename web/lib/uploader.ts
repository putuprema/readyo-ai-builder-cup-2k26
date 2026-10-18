import type { SourceKind } from "@adidi/shared";
import type { AcceptedType } from "./documents";

// How the documents step stores a file. The real version (task 8) asks the api for a
// signed URL and PUTs the file; the mock below only simulates progress so the page can be
// built first.

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

export const mockUploader: Uploader = {
  upload({ file, onProgress, signal }) {
    return new Promise((resolve, reject) => {
      let percent = 0;
      const timer = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(timer);
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        percent = Math.min(100, percent + 20);
        onProgress(percent);
        if (percent >= 100) {
          clearInterval(timer);
          if (/fail/i.test(file.name)) reject(new Error("The storage service refused the file."));
          else resolve({ docId: `mock_${Math.random().toString(36).slice(2, 10)}` });
        }
      }, 200);
    });
  },
  async remove() {
    await new Promise((r) => setTimeout(r, 300));
  },
};
