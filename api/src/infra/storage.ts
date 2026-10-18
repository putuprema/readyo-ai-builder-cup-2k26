import { getStorage } from "firebase-admin/storage";
import { firebaseApp } from "../firebase.js";
import type { UploadStorage } from "../uploads/ports.js";

// Cloud Storage adapter for the upload endpoints. Signed URLs need a signing identity: on
// Cloud Run the service account signs through the IAM credentials API (it needs
// roles/iam.serviceAccountTokenCreator on itself, see README "Uploads"); on the emulators
// there is none, which is why the api proxies uploads there (uploads/uploads.ts).

export function cloudStorageUploads(bucketName = process.env.STORAGE_BUCKET): UploadStorage {
  const bucket = getStorage(firebaseApp()).bucket(bucketName);
  return {
    async signedUploadUrl(path, contentType, expires) {
      const [url] = await bucket.file(path).getSignedUrl({
        version: "v4",
        action: "write",
        expires,
        contentType,
      });
      return url;
    },
    async put(path, bytes, contentType) {
      await bucket.file(path).save(Buffer.from(bytes), { contentType, resumable: false });
    },
    async delete(path) {
      await bucket.file(path).delete({ ignoreNotFound: true });
    },
  };
}
