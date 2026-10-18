import { apiFetch } from "./api";

// DELETE /me/data (specs/01-contracts.md): removes everything the app stored for the signed-in
// user (Firestore under users/{uid} and their files in Cloud Storage) and keeps the sign-in.

export interface DeletedCounts {
  profile: number;
  goals: number;
  analyses: number;
  months: number;
  transactions: number;
  loans: number;
  holdings: number;
  documents: number;
  runs: number;
  overrides: number;
  files: number;
}

export async function deleteAllData(): Promise<DeletedCounts> {
  const response = await apiFetch<{ deleted: DeletedCounts }>("/me/data", { method: "DELETE" });
  return response.deleted;
}
