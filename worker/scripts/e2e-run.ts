// One real `first` run on the Firebase emulators (specs/07-pipeline-runs.md, acceptance
// criterion 1): seeds the rules, a profile and a priced draft house goal, uploads the synthetic
// September 2026 statements from fixtures/statements to the Storage emulator, writes the run
// document the way POST /runs does, then calls the worker's POST /runs in-process against the
// real Firestore and Storage adapters and the real Gemini model, printing every stage update a
// listener sees and the stored results.
//
//   pnpm --filter worker e2e:emulator      (needs GEMINI_API_KEY in worker/.env and Java)
//
// Exits 1 unless the run ends `done` with the stages in order and an Analysis stored.
import {
  type Analysis,
  type DocumentRecord,
  firestorePaths,
  type Goal,
  hasUndefined,
  type MonthRecord,
  type RuleValue,
  type RunStatus,
  type UserRecord,
} from "@adidi/shared";
import defaults from "@adidi/shared/rules/defaults.json" with { type: "json" };
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { storagePathFor } from "../src/extraction/ports.js";
import { loadFixtures, readFixtureBytes } from "../src/fixtures.js";
import { createGeminiModel } from "../src/gemini/client.js";
import { cloudStorage, firestoreRecords, firestoreRunStore } from "../src/infra/firebase.js";
import { createWorkerApp } from "../src/pipeline/app.js";
import { allowAllTasks } from "../src/pipeline/auth.js";
import { createRunners } from "../src/pipeline/kinds.js";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  fail("Run inside the emulators: pnpm --filter worker e2e:emulator");
}
if (!process.env.GEMINI_API_KEY) fail("GEMINI_API_KEY is not set (worker/.env)");

const PROJECT = "demo-adidi";
const BUCKET = process.env.STORAGE_BUCKET ?? `${PROJECT}.appspot.com`;
process.env.STORAGE_BUCKET = BUCKET;
const UID = "e2e-user";
const GOAL_ID = "house-e2e";
const MONTH = "2026-09";
const RUN_ID = `run_e2e_${Date.now().toString(36)}`;

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore(app);
const bucket = getStorage(app).bucket(BUCKET);

// The synthetic household (worker/scripts/sample-data.ts): a salaried employee, Rp 15 m a month.
const user: UserRecord = {
  age: 29,
  employment: "permanent",
  netMonthlyIncome: 15_000_000,
  maritalStatus: "single",
  dependents: 0,
  city: "Tangerang Selatan",
};

const goal: Goal = {
  id: GOAL_ID,
  type: "house",
  status: "draft",
  draftStep: "documents",
  payPreference: "loan",
  inputs: {
    area: "Tangerang Selatan",
    propertyType: "landed",
    landM2: 60,
    buildingM2: 45,
    market: "new",
    firstHome: true,
    targetYear: 2029,
    joint: "not_married",
  },
  estimate: {
    targetToday: 650_000_000,
    rangeLow: 550_000_000,
    rangeHigh: 750_000_000,
    growthRatePerYear: 0.06,
    targetAtGoalDate: 774_000_000,
    sources: [{ title: "Sample listing", url: "https://example.com/", date: "2026-10" }],
    inputsUsed: {},
    calculatedAt: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function seed(): Promise<DocumentRecord[]> {
  await db.recursiveDelete(db.doc(firestorePaths.user(UID)));
  const batch = db.batch();
  for (const rule of defaults as RuleValue[]) batch.set(db.doc(firestorePaths.rule(rule.id)), rule);
  batch.set(db.doc(firestorePaths.user(UID)), user);
  batch.set(db.doc(firestorePaths.goal(UID, GOAL_ID)), goal);

  const { fixtures } = loadFixtures();
  const samples = fixtures.filter(
    (f) => f.name.startsWith("sample_") && f.expected.month === MONTH,
  );
  if (samples.length === 0) fail("No sample_* fixtures found in fixtures/statements");
  const documents: DocumentRecord[] = [];
  for (const fixture of samples) {
    const doc: DocumentRecord = { ...fixture.document, size: readFixtureBytes(fixture).byteLength };
    documents.push(doc);
    batch.set(db.doc(firestorePaths.document(UID, doc.id)), doc);
    await bucket.file(storagePathFor(UID, doc.id)).save(Buffer.from(readFixtureBytes(fixture)), {
      contentType: fixture.mimeType,
    });
  }
  await batch.commit();
  console.log(
    `seeded ${(defaults as RuleValue[]).length} rules, the profile, the goal and ${documents.length} documents: ${documents.map((d) => d.name).join(", ")}`,
  );
  return documents;
}

async function createRunDocument(documents: DocumentRecord[]): Promise<void> {
  // The same document POST /runs writes (api/src/runs/create-run.ts).
  const startedAt = new Date().toISOString();
  const run: RunStatus = {
    id: RUN_ID,
    stage: "reading",
    percent: 0,
    startedAt,
    updatedAt: startedAt,
    goalIds: [GOAL_ID],
    month: MONTH,
    kind: "first",
    documentIds: documents.map((d) => d.id),
    goalStatusBefore: { [GOAL_ID]: "draft" },
    attempt: 0,
  };
  const batch = db.batch();
  batch.set(db.doc(firestorePaths.run(UID, RUN_ID)), run);
  batch.update(db.doc(firestorePaths.goal(UID, GOAL_ID)), {
    status: "analysing",
    updatedAt: startedAt,
  });
  await batch.commit();
}

const documents = await seed();
await createRunDocument(documents);

// What the progress view would see.
const seen: { stage: string; percent: number; at: number }[] = [];
const started = Date.now();
const unsubscribe = db.doc(firestorePaths.run(UID, RUN_ID)).onSnapshot((snap) => {
  const data = snap.data() as RunStatus | undefined;
  if (!data) return;
  const last = seen[seen.length - 1];
  if (last && last.stage === data.stage && last.percent === data.percent) return;
  seen.push({ stage: data.stage, percent: data.percent, at: Date.now() - started });
  console.log(
    `  listener: ${data.stage} ${data.percent}% at ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
});

const worker = createWorkerApp({
  verifyTask: allowAllTasks,
  log: false,
  pipeline: {
    store: firestoreRunStore(db),
    runners: createRunners({
      storage: cloudStorage(BUCKET),
      records: firestoreRecords(db),
      model: createGeminiModel(),
    }),
    log: (m) => console.log(`  worker: ${m}`),
  },
});

console.log(`POST /runs { uid: ${UID}, runId: ${RUN_ID} }`);
const response = await worker.request("/runs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ uid: UID, runId: RUN_ID }),
});
const body = await response.json();
console.log(
  `worker answered ${response.status} ${JSON.stringify(body)} after ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
await new Promise((r) => setTimeout(r, 500));
unsubscribe();

// ---- what was stored ----
const run = (await db.doc(firestorePaths.run(UID, RUN_ID)).get()).data() as RunStatus;
const storedGoal = (await db.doc(firestorePaths.goal(UID, GOAL_ID)).get()).data() as Goal;
const month = (await db.doc(firestorePaths.month(UID, MONTH)).get()).data() as
  | MonthRecord
  | undefined;
const analysisSnap = await db.doc(firestorePaths.analysis(UID, GOAL_ID, MONTH)).get();
const analysis = analysisSnap.data() as Analysis | undefined;
const docs = await db.collection(`${firestorePaths.user(UID)}/documents`).get();
const txns = await db.collection(`${firestorePaths.user(UID)}/transactions`).get();
const [files] = await bucket.getFiles({ prefix: `users/${UID}/` });

console.log("\nResult");
console.log(`  stages seen: ${seen.map((s) => `${s.stage} ${s.percent}%`).join(" → ")}`);
console.log(
  `  run: ${run.stage}${run.error ? ` (${run.error})` : ""}, attempt ${run.attempt}, goals ${JSON.stringify(run.goals ?? {})}`,
);
console.log(`  goal: ${storedGoal.status}, latestAnalysisMonth ${storedGoal.latestAnalysisMonth}`);
console.log(
  `  documents: ${docs.docs.map((d) => `${d.get("sourceKind")} ${d.get("status")}`).join(", ")}; files left in the bucket: ${files.length}`,
);
console.log(
  `  transactions stored: ${txns.size}, classified: ${txns.docs.filter((d) => d.get("cls")).length}`,
);
if (month) {
  const s = month.snapshot;
  console.log(
    `  snapshot: income Rp ${s.netIncome} (computed Rp ${s.computedNetIncome}), essential Rp ${s.essentialSpending}, discretionary Rp ${s.discretionarySpending}, debt Rp ${s.debtPayments}, liquid Rp ${s.liquidAssets} (bank Rp ${s.bankBalances}), volatile Rp ${s.volatileAssets}, loans ${s.loans.map((l) => `${l.lender} Rp ${l.outstandingPrincipal}`).join("; ")}, sources ${month.sources.map((x) => x.kind).join(", ")}`,
  );
}
if (analysis) {
  console.log(`  metrics: ${analysis.metrics.map((m) => `${m.id}=${m.status}`).join(", ")}`);
  console.log(
    `  without plan: loan ${analysis.withoutPlan.loan?.monthsToReady ?? "n/a"} months (blocked by ${analysis.withoutPlan.loan?.blockedBy.map((b) => b.rule).join(", ") || "nothing"}), cash ${analysis.withoutPlan.cash.monthsToReady}; with plan: loan ${analysis.withPlan.loan?.monthsToReady ?? "n/a"}, cash ${analysis.withPlan.cash.monthsToReady}`,
  );
  for (const a of analysis.actions)
    console.log(`  action ${a.id}: ${a.title} | ${a.impactLine} | ${a.chips.join(", ")}`);
  console.log(`  summary: ${analysis.summary}`);
  console.log(
    `  analysis document: ${Buffer.byteLength(JSON.stringify(analysis))} bytes, undefined values: ${hasUndefined(analysis)}`,
  );
}

const expectedStages = ["reading", "cleaning", "checking", "planning", "done"];
const stagesInOrder = expectedStages.every(
  (stage, i) =>
    seen.filter((s) => s.stage === stage).length > 0 &&
    seen.findIndex((s) => s.stage === stage) >=
      (i === 0 ? 0 : seen.findIndex((s) => s.stage === (expectedStages[i - 1] as string))),
);
const ok =
  response.status === 200 &&
  run.stage === "done" &&
  stagesInOrder &&
  analysis !== undefined &&
  storedGoal.status === "active" &&
  files.length === 0;
console.log(ok ? "\nPASS" : "\nFAIL");
process.exit(ok ? 0 : 1);

function fail(message: string): never {
  console.error(`e2e-run: ${message}`);
  process.exit(1);
}
