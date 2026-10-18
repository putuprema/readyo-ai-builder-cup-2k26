// Drives a run document through the pipeline stages on the Firestore emulator, so the
// progress view can be checked without the worker (specs/11-ui-progress-result.md,
// acceptance criteria). Signs in as the seeded demo user through the Auth emulator and
// writes users/{uid}/runs/fake-run with the same stage and percent values the worker writes.
//
//   pnpm seed:demo:emulator           (once, while the emulators run: see docs/progress.md)
//   node web/components/result/dev/fake-run.mts            # reading → … → done
//   node web/components/result/dev/fake-run.mts failed     # ends in the failed state
//
// Then open http://localhost:3000/goals/house-tangsel/progress/?run=fake-run with
// NEXT_PUBLIC_USE_EMULATORS=1 in web/.env.local.
import { DEMO_EMAIL, DEMO_GOAL_ID, DEMO_MONTH, firestorePaths } from "@adidi/shared";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from "firebase/firestore";

const STAGES: [string, number][] = [
  ["reading", 0],
  ["reading", 18],
  ["cleaning", 42],
  ["checking", 71],
  ["planning", 92],
  ["done", 100],
];
const STEP_MS = Number(process.env.FAKE_RUN_STEP_MS ?? 2500);
const endInFailure = process.argv[2] === "failed";

const app = initializeApp({ apiKey: "demo-api-key", projectId: "demo-adidi" });
const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8085);

const { user } = await signInWithEmailAndPassword(auth, DEMO_EMAIL, "demo-pass-2026");
const ref = doc(db, firestorePaths.run(user.uid, "fake-run"));
const startedAt = new Date().toISOString();

for (const [i, [stage, percent]] of STAGES.entries()) {
  const failNow = endInFailure && stage === "cleaning";
  const data = {
    id: "fake-run",
    stage: failNow ? "failed" : stage,
    percent,
    startedAt,
    goalIds: [DEMO_GOAL_ID],
    month: DEMO_MONTH,
    kind: "first",
    updatedAt: new Date().toISOString(),
    ...(failNow
      ? {
          error:
            "The bank statement could not be read. Upload a PDF e-statement, not a screenshot of the app.",
        }
      : {}),
  };
  await setDoc(ref, data);
  console.log(`run fake-run: ${data.stage} ${percent}%`);
  if (failNow) break;
  if (i < STAGES.length - 1) await new Promise((r) => setTimeout(r, STEP_MS));
}
await auth.signOut();
process.exit(0);
