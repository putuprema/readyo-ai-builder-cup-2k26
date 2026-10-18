/**
 * A deep copy with every `undefined` property dropped, as Firestore stores it. Firestore rejects
 * `undefined` values, and simulate() leaves `installment` / `dti` undefined once no tenor is
 * allowed, so every result written by the pipeline goes through here (decision recorded in
 * docs/progress.md, 2026-10-18).
 */
export function plainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** True when any nested property is `undefined` (the demo seed and the pipeline tests check this). */
export function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasUndefined);
  return Object.values(value as Record<string, unknown>).some(hasUndefined);
}
