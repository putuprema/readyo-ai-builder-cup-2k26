import { createHash } from "node:crypto";

// Deterministic record ids: the same file extracted twice (a Cloud Tasks retry) produces the
// same ids, so writes are idempotent and never duplicate rows (specs/07-pipeline-runs.md).

export function recordId(prefix: string, ...parts: (string | number | null | undefined)[]): string {
  const hash = createHash("sha1")
    .update(parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("\u0001"))
    .digest("hex")
    .slice(0, 20);
  return `${prefix}_${hash}`;
}
