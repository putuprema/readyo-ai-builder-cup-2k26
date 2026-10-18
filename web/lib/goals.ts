import type {
  EstimateResponse,
  Goal,
  GoalInputs,
  GoalType,
  HouseInputs,
  PayPreference,
} from "@adidi/shared";
import { firestorePaths } from "@adidi/shared";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { apiFetch } from "./api";
import { firestore } from "./firebase";

// Goal writes go through the api (specs/01-contracts.md); reads come straight from Firestore.

export function createDraft(body: {
  type: GoalType;
  payPreference: PayPreference;
  inputs: GoalInputs;
}): Promise<Goal> {
  return apiFetch<Goal>("/goals", { method: "POST", body });
}

/** `inputs` may hold `null` for an optional field to remove it (api PATCH semantics). */
export interface GoalPatch {
  inputs?: Record<string, unknown>;
  payPreference?: PayPreference;
  userOverride?: number | null;
  draftStep?: "estimate" | "documents";
}

export function patchGoal(goalId: string, patch: GoalPatch): Promise<Goal> {
  return apiFetch<Goal>(`/goals/${goalId}`, { method: "PATCH", body: patch });
}

export function deleteGoal(goalId: string): Promise<void> {
  return apiFetch<void>(`/goals/${goalId}`, { method: "DELETE" });
}

export function estimateGoal(goalId: string, type: GoalType, inputs: GoalInputs) {
  return apiFetch<EstimateResponse>(`/goals/${goalId}/estimate`, {
    method: "POST",
    body: { type, inputs },
  });
}

/** The full house patch for a form: every optional field present or null, so stale values go. */
export function houseInputsPatch(inputs: HouseInputs): Record<string, unknown> {
  return {
    area: inputs.area,
    propertyType: inputs.propertyType,
    market: inputs.market,
    firstHome: inputs.firstHome,
    targetYear: inputs.targetYear,
    landM2: inputs.landM2 ?? null,
    buildingM2: inputs.buildingM2 ?? null,
    budgetRange: inputs.budgetRange ?? null,
    plannedDp: inputs.plannedDp ?? null,
    joint: inputs.joint ?? null,
    preferredTenorYears: inputs.preferredTenorYears ?? null,
  };
}

function goalRef(uid: string, goalId: string) {
  return doc(firestore(), firestorePaths.goal(uid, goalId));
}

export async function loadGoal(uid: string, goalId: string): Promise<Goal | null> {
  const snap = await getDoc(goalRef(uid, goalId));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Goal), id: snap.id };
}

/** Live goal document; `callback(null)` when it does not exist (or was deleted). */
export function listenGoal(
  uid: string,
  goalId: string,
  callback: (goal: Goal | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    goalRef(uid, goalId),
    (snap) => callback(snap.exists() ? { ...(snap.data() as Goal), id: snap.id } : null),
    (error) => onError?.(error),
  );
}
