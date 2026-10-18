import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

// Security rules from specs/01-contracts.md: a user reads and writes only under
// users/{uid}; rules/ is read-only to clients. Runs inside `firebase emulators:exec`
// (scripts/test-rules.sh), which sets FIRESTORE_EMULATOR_HOST.

const ALICE = "alice";
const BOB = "bob";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-adidi",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

/** Writes with the rules switched off, to set up what a test reads. */
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

const asAlice = () => env.authenticatedContext(ALICE).firestore();
const asBob = () => env.authenticatedContext(BOB).firestore();
const asAnon = () => env.unauthenticatedContext().firestore();

describe("users/{uid}", () => {
  it("lets the owner read and write their profile", async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `users/${ALICE}`), { city: "Tangerang Selatan" }));
    await assertSucceeds(getDoc(doc(asAlice(), `users/${ALICE}`)));
  });

  it("denies another user reading the profile", async () => {
    await seed(`users/${ALICE}`, { city: "Tangerang Selatan" });
    await assertFails(getDoc(doc(asBob(), `users/${ALICE}`)));
  });

  it("denies another user writing the profile", async () => {
    await assertFails(setDoc(doc(asBob(), `users/${ALICE}`), { city: "x" }));
  });

  it("denies unauthenticated access", async () => {
    await seed(`users/${ALICE}`, { city: "Tangerang Selatan" });
    await assertFails(getDoc(doc(asAnon(), `users/${ALICE}`)));
    await assertFails(setDoc(doc(asAnon(), `users/${ALICE}`), { city: "x" }));
  });
});

describe("users/{uid} subcollections", () => {
  const paths = [
    `users/${ALICE}/months/2026-09`,
    `users/${ALICE}/transactions/t1`,
    `users/${ALICE}/loans/l1`,
    `users/${ALICE}/holdings/h1`,
    `users/${ALICE}/documents/d1`,
    `users/${ALICE}/goals/g1`,
    `users/${ALICE}/goals/g1/analyses/2026-09`,
    `users/${ALICE}/runs/r1`,
    `users/${ALICE}/overrides/dti_cap`,
  ];

  for (const path of paths) {
    it(`${path}: owner can read, write and delete`, async () => {
      await assertSucceeds(setDoc(doc(asAlice(), path), { ok: true }));
      await assertSucceeds(getDoc(doc(asAlice(), path)));
      await assertSucceeds(deleteDoc(doc(asAlice(), path)));
    });

    it(`${path}: another user cannot read or write`, async () => {
      await seed(path, { ok: true });
      await assertFails(getDoc(doc(asBob(), path)));
      await assertFails(setDoc(doc(asBob(), path), { ok: false }));
      await assertFails(deleteDoc(doc(asBob(), path)));
    });
  }
});

describe("rules/{ruleId}", () => {
  it("is readable by a signed-in user", async () => {
    await seed("rules/dti_cap", { value: 0.35 });
    await assertSucceeds(getDoc(doc(asAlice(), "rules/dti_cap")));
  });

  it("is not readable without sign-in", async () => {
    await seed("rules/dti_cap", { value: 0.35 });
    await assertFails(getDoc(doc(asAnon(), "rules/dti_cap")));
  });

  it("cannot be written by a client", async () => {
    await assertFails(setDoc(doc(asAlice(), "rules/dti_cap"), { value: 0.9 }));
    await assertFails(deleteDoc(doc(asAlice(), "rules/dti_cap")));
  });
});

describe("anything else", () => {
  it("is denied even to a signed-in user", async () => {
    await assertFails(setDoc(doc(asAlice(), "admin/config"), { x: 1 }));
    await assertFails(getDoc(doc(asAlice(), "admin/config")));
  });
});
