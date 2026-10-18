import type { Profile, UserRecord } from "@adidi/shared";
import { firestorePaths } from "@adidi/shared";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestore } from "./firebase";

// The profile lives at users/{uid} (specs/01-contracts.md). It is asked once, in a modal on
// the first goal (spec 10 decisions), and written by the browser: the security rules allow
// owner writes and no server logic depends on it before the run reads it.

export async function loadProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(doc(firestore(), firestorePaths.user(uid)));
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<UserRecord>;
  return isComplete(data) ? data : null;
}

export async function saveProfile(uid: string, profile: Profile): Promise<void> {
  // Merge keeps `preferences` (dismissed actions) written by the api.
  await setDoc(doc(firestore(), firestorePaths.user(uid)), stripUndefined(profile), {
    merge: true,
  });
}

export function isComplete(data: Partial<Profile>): data is Profile {
  return (
    typeof data.age === "number" &&
    typeof data.netMonthlyIncome === "number" &&
    typeof data.employment === "string" &&
    typeof data.maritalStatus === "string" &&
    typeof data.dependents === "number" &&
    typeof data.city === "string"
  );
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
