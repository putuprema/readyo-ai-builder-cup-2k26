// Firestore document paths from specs/01-contracts.md ("Firestore layout").
// Every reader and writer builds paths from here so the layout lives in one place.

export const firestorePaths = {
  user: (uid: string) => `users/${uid}`,
  month: (uid: string, month: string) => `users/${uid}/months/${month}`,
  transaction: (uid: string, id: string) => `users/${uid}/transactions/${id}`,
  loan: (uid: string, id: string) => `users/${uid}/loans/${id}`,
  holding: (uid: string, id: string) => `users/${uid}/holdings/${id}`,
  document: (uid: string, id: string) => `users/${uid}/documents/${id}`,
  goal: (uid: string, goalId: string) => `users/${uid}/goals/${goalId}`,
  analysis: (uid: string, goalId: string, month: string) =>
    `users/${uid}/goals/${goalId}/analyses/${month}`,
  run: (uid: string, runId: string) => `users/${uid}/runs/${runId}`,
  override: (uid: string, ruleId: string) => `users/${uid}/overrides/${ruleId}`,
  rule: (ruleId: string) => `rules/${ruleId}`,
} as const;

/** "YYYY-MM" as used for every month key. */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_PATTERN.test(value);
}
