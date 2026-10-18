import { createHash } from "node:crypto";

// Deterministic record ids: the same file extracted twice (a Cloud Tasks retry) produces the
// same ids, so writes are idempotent and never duplicate rows (specs/07-pipeline-runs.md).
//
// The hex hash is written in groups of five ("txn_1a2b3-4c5d6-7e8f9-0a1b2") so an id can never
// contain a digit run long enough to look like an account number to the masking scan.
export function recordId(prefix: string, ...parts: (string | number | null | undefined)[]): string {
  const hash = createHash("sha1")
    .update(parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("\u0001"))
    .digest("hex")
    .slice(0, 20);
  const grouped = hash.match(/.{1,5}/g)?.join("-") ?? hash;
  return `${prefix}_${grouped}`;
}
