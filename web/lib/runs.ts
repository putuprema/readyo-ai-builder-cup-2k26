import type { RunKind } from "@adidi/shared";
import { firestorePaths } from "@adidi/shared";
import { collection, getDocs } from "firebase/firestore";
import { apiFetch } from "./api";
import { firestore } from "./firebase";

// Submit (specs/07-pipeline-runs.md): POST /runs answers 202 with the runId; the progress
// view (spec 11) then listens to users/{uid}/runs/{runId}.

export function startRun(body: {
  kind: RunKind;
  goalIds: string[];
  month: string;
  documentIds?: string[];
}): Promise<{ runId: string }> {
  return apiFetch<{ runId: string }>("/runs", { method: "POST", body });
}

/** Month keys the user has already submitted (users/{uid}/months). */
export async function listSubmittedMonths(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(firestore(), `${firestorePaths.user(uid)}/months`));
  return snap.docs.map((d) => d.id);
}

/** What the api's 409 codes mean to the person on the documents step. */
export function runErrorMessage(code: string, fallback: string): string {
  switch (code) {
    case "goal_analysing":
      return "This goal is already being analysed.";
    case "goal_status":
      return "This goal was already submitted. Open it from your goals instead.";
    case "goal_not_priced":
      return "The goal has no target yet. Go back and calculate the estimate, or type a price.";
    case "queue_unavailable":
      return "The analysis could not be started. Try again in a moment.";
    default:
      return fallback;
  }
}
