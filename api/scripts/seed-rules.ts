// Seeds the `rules` collection from shared/rules/defaults.json (specs/02-simulate.md, "Rules
// and assumptions"): one RuleValue document per rule at rules/{ruleId}. Only the checked
// defaults are written. The [__] rules stay absent until a checked value lands in
// defaults.json, and fixtures/profiles/rules-test.json is test-only and never read here.
//
//   pnpm seed:rules                      against the real project (needs ADC and FIREBASE_PROJECT_ID)
//   pnpm seed:rules:emulator             against the Firestore emulator
//
// Re-running overwrites each rule document. Documents whose id is no longer in defaults.json
// are listed and left alone.
import { firestorePaths, RULE_IDS, type RuleValue } from "@adidi/shared";
import defaults from "@adidi/shared/rules/defaults.json" with { type: "json" };
import { getFirestore } from "firebase-admin/firestore";
import { adminApp, onEmulator, resolveProjectId } from "./admin.js";

const projectId = resolveProjectId();
if (!projectId) {
  fail("Set FIREBASE_PROJECT_ID (or run against the emulators with FIRESTORE_EMULATOR_HOST).");
}

const rules = defaults as RuleValue[];
validate(rules);

const db = getFirestore(adminApp(projectId));

console.log(`seed-rules: project ${projectId}${onEmulator ? " (emulators)" : ""}`);
const batch = db.batch();
for (const rule of rules) batch.set(db.doc(firestorePaths.rule(rule.id)), { ...rule });
await batch.commit();
console.log(`firestore: wrote ${rules.length} rule documents`);

const stored = await db.collection("rules").get();
const seeded = new Set(rules.map((r) => r.id));
const stale = stored.docs.map((d) => d.id).filter((id) => !seeded.has(id));
const sample = stored.docs.find((d) => d.id === "dti_cap");
console.log(
  `check: ${stored.size} documents in rules/, dti_cap reads back ${String(sample?.get("value"))} (${String(sample?.get("unit"))})`,
);
if (stale.length > 0) {
  console.log(
    `check: ${stale.length} documents are not in defaults.json and were left alone: ${stale.join(", ")}`,
  );
}
const missing = RULE_IDS.filter((id) => !seeded.has(id));
if (missing.length > 0) {
  console.log(
    `note: ${missing.length} rules have no checked default yet and were not seeded: ${missing.join(", ")}`,
  );
}

/** The file is data the app trusts; refuse to seed anything simulate() would not recognise. */
function validate(values: RuleValue[]): void {
  const known = new Set<string>(RULE_IDS);
  const seen = new Set<string>();
  for (const rule of values) {
    if (!known.has(rule.id))
      fail(`"${rule.id}" is not a rule id simulate() knows (shared/src/rules.ts)`);
    if (seen.has(rule.id)) fail(`"${rule.id}" appears twice in defaults.json`);
    if (!Number.isFinite(rule.value)) fail(`"${rule.id}" has no finite value`);
    seen.add(rule.id);
  }
}

function fail(message: string): never {
  console.error(`seed-rules: ${message}`);
  process.exit(1);
}
