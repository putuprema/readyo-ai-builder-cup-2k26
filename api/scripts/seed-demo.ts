// Seeds one demo user with an active house goal and its analysis (specs/01-contracts.md,
// task 4). Data comes from @adidi/shared (demoSeedDocuments); this script only writes it.
//
//   pnpm seed:demo                       against the real project (needs ADC and DEMO_PASSWORD)
//   pnpm seed:demo:emulator              against the Firestore + Auth emulators
//   ... seed:demo --goals-list           emulators only: adds the goals-list demo (spec 12),
//                                        one analysing, two draft and a second active goal
//   ... seed:demo --empty-user           emulators only: also creates empty@adidi.app (same
//                                        password, no goals) for the empty states (4a, 5a)
//
// Re-running replaces the demo user's Firestore tree and keeps the Auth user. The rules the
// analysis was simulated with are seeded separately (pnpm seed:rules).
import {
  DEMO_DISPLAY_NAME,
  DEMO_EMAIL,
  DEMO_UID,
  demoSeedDocuments,
  goalsListSeedDocuments,
} from "@adidi/shared";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { adminApp, onEmulator, resolveProjectId } from "./admin.js";

const projectId = resolveProjectId();
if (!projectId) {
  fail("Set FIREBASE_PROJECT_ID (or run against the emulators with FIRESTORE_EMULATOR_HOST).");
}

// The demo account's password. On the emulators a fixed test value is fine; on the real
// project it must be provided and is never stored in the repo.
const password = process.env.DEMO_PASSWORD ?? (onEmulator ? "demo-pass-2026" : undefined);
if (!password) {
  fail("Set DEMO_PASSWORD for the demo account (at least 6 characters).");
}

// The goals-list extras include a run that never finishes, so they stay off the real project.
const goalsList = process.argv.includes("--goals-list");
if (goalsList && !onEmulator) fail("--goals-list is for the emulators only.");
const emptyUser = process.argv.includes("--empty-user");
if (emptyUser && !onEmulator) fail("--empty-user is for the emulators only.");
const EMPTY_UID = "empty-user";
const EMPTY_EMAIL = "empty@adidi.app";

const app = adminApp(projectId);
const auth = getAuth(app);
const db = getFirestore(app);

async function upsertAuthUser(uid = DEMO_UID, email = DEMO_EMAIL, displayName = DEMO_DISPLAY_NAME) {
  const fields = { email, displayName, password, emailVerified: true };
  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, fields);
    console.log(`auth: updated ${email} (uid ${uid})`);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    await auth.createUser({ uid, ...fields });
    console.log(`auth: created ${email} (uid ${uid})`);
  }
}

async function replaceFirestoreTree(): Promise<number> {
  await db.recursiveDelete(db.doc(`users/${DEMO_UID}`));
  const docs = demoSeedDocuments(DEMO_UID);
  if (goalsList) docs.push(...goalsListSeedDocuments(DEMO_UID));
  // Firestore batches take at most 500 writes.
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 400)) batch.set(db.doc(d.path), d.data);
    await batch.commit();
  }
  return docs.length;
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "auth/user-not-found"
  );
}

function fail(message: string): never {
  console.error(`seed-demo: ${message}`);
  process.exit(1);
}

console.log(`seed-demo: project ${projectId}${onEmulator ? " (emulators)" : ""}`);
await upsertAuthUser();
if (emptyUser) {
  await upsertAuthUser(EMPTY_UID, EMPTY_EMAIL, "Empty");
  await db.recursiveDelete(db.doc(`users/${EMPTY_UID}`));
}
const count = await replaceFirestoreTree();
console.log(`firestore: wrote ${count} documents under users/${DEMO_UID}`);
const goal = await db.doc(`users/${DEMO_UID}/goals/house-tangsel`).get();
console.log(
  `check: goal status ${String(goal.get("status"))}, latest analysis ${String(goal.get("latestAnalysisMonth"))}`,
);
