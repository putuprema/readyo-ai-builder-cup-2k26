import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

// Acceptance criteria from specs/01-contracts.md: every endpoint exists, validates its
// input against the types, and returns 401 without a Firebase ID token.

const GOOD_TOKEN = "good-token";
const app = createApp({
  verifyToken: async (token) => (token === GOOD_TOKEN ? { uid: "u1" } : null),
  log: false,
});

const json = (body: unknown) => JSON.stringify(body);

function request(
  method: string,
  path: string,
  options: { body?: unknown; token?: string | null } = {},
) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token !== null) headers.Authorization = `Bearer ${options.token ?? GOOD_TOKEN}`;
  return app.request(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : json(options.body),
  });
}

const houseInputs = {
  area: "Tangerang Selatan",
  propertyType: "landed",
  market: "new",
  firstHome: true,
  targetYear: 2029,
};

// Every endpoint with one valid request each.
const endpoints: { method: string; path: string; body?: unknown }[] = [
  {
    method: "POST",
    path: "/goals",
    body: { type: "house", payPreference: "loan", inputs: houseInputs },
  },
  { method: "PATCH", path: "/goals/g1", body: { payPreference: "cash" } },
  { method: "DELETE", path: "/goals/g1" },
  { method: "POST", path: "/goals/g1/estimate", body: { type: "house", inputs: houseInputs } },
  {
    method: "POST",
    path: "/uploads",
    body: {
      name: "bca.pdf",
      type: "application/pdf",
      size: 1024,
      sourceKind: "bank",
      month: "2026-09",
    },
  },
  { method: "DELETE", path: "/uploads/d1" },
  {
    method: "POST",
    path: "/runs",
    body: { kind: "first", goalIds: ["g1"], month: "2026-09", documentIds: ["d1"] },
  },
  {
    method: "PATCH",
    path: "/goals/g1/analyses/2026-09/choices",
    body: { actionId: "a1", choice: "committed" },
  },
  { method: "PUT", path: "/overrides/dti_cap", body: { value: 0.4 } },
  { method: "POST", path: "/recalculate" },
  { method: "DELETE", path: "/me/data" },
];

describe("auth", () => {
  for (const e of endpoints) {
    it(`${e.method} ${e.path} returns 401 without a token`, async () => {
      const res = await request(e.method, e.path, { body: e.body, token: null });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: "unauthorized" });
    });
  }

  it("returns 401 for a token the verifier rejects", async () => {
    const res = await request("POST", "/recalculate", { token: "bad-token" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for a non-bearer Authorization header", async () => {
    const res = await app.request("/recalculate", {
      method: "POST",
      headers: { Authorization: `Basic ${GOOD_TOKEN}` },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when the verifier throws", async () => {
    const throwing = createApp({
      verifyToken: async () => {
        throw new Error("network");
      },
      log: false,
    });
    const res = await throwing.request("/recalculate", {
      method: "POST",
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(401);
  });

  it("leaves /health open", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, service: "api" });
  });
});

describe("stubs", () => {
  for (const e of endpoints) {
    it(`${e.method} ${e.path} accepts a valid request`, async () => {
      const res = await request(e.method, e.path, { body: e.body });
      expect(res.status).toBe(501);
      expect(await res.json()).toMatchObject({ error: "not_implemented" });
    });
  }

  it("returns 404 for unknown routes", async () => {
    const res = await request("GET", "/nope");
    expect(res.status).toBe(404);
  });
});

describe("validation", () => {
  async function expectInvalid(method: string, path: string, body?: unknown, pathHint?: string) {
    const res = await request(method, path, { body });
    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error: string; issues: { path: string }[] };
    expect(payload.error).toBe("invalid_request");
    if (pathHint !== undefined) {
      expect(payload.issues.map((i) => i.path)).toContain(pathHint);
    }
  }

  it("rejects a malformed JSON body", async () => {
    const res = await app.request("/goals", {
      method: "POST",
      headers: { Authorization: `Bearer ${GOOD_TOKEN}`, "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  describe("POST /goals", () => {
    it("rejects an unknown goal type", () =>
      expectInvalid("POST", "/goals", { type: "boat", payPreference: "cash", inputs: {} }, "type"));

    it("rejects house inputs missing a required field", () =>
      expectInvalid(
        "POST",
        "/goals",
        { type: "house", payPreference: "loan", inputs: { ...houseInputs, market: undefined } },
        "inputs.market",
      ));

    it("rejects car inputs on a house goal", () =>
      expectInvalid("POST", "/goals", {
        type: "house",
        payPreference: "loan",
        inputs: { condition: "new", modelOrSegment: "MPV", city: "Jakarta", targetYear: 2028 },
      }));

    it("rejects a wedding with a loan preference", () =>
      expectInvalid(
        "POST",
        "/goals",
        {
          type: "wedding",
          payPreference: "loan",
          inputs: {
            targetMonth: "2027-06",
            city: "Bandung",
            guests: 300,
            scale: "standard",
            partnerShare: 50_000_000,
            familyContribution: 60_000_000,
            honeymoon: "domestic",
          },
        },
        "payPreference",
      ));

    it("rejects a budget range with low above high", () =>
      expectInvalid(
        "POST",
        "/goals",
        {
          type: "house",
          payPreference: "loan",
          inputs: { ...houseInputs, budgetRange: [2_000_000_000, 1_000_000_000] },
        },
        "inputs.budgetRange",
      ));

    it("rejects non-integer rupiah", () =>
      expectInvalid(
        "POST",
        "/goals",
        { type: "house", payPreference: "loan", inputs: { ...houseInputs, plannedDp: 100.5 } },
        "inputs.plannedDp",
      ));

    it("accepts a complete car goal", async () => {
      const res = await request("POST", "/goals", {
        body: {
          type: "car",
          payPreference: "none",
          inputs: {
            condition: "used",
            modelOrSegment: "Toyota Avanza",
            city: "Surabaya",
            targetYear: 2028,
          },
        },
      });
      expect(res.status).toBe(501);
    });
  });

  describe("PATCH /goals/:id", () => {
    it("rejects an empty update", () => expectInvalid("PATCH", "/goals/g1", {}));

    it("rejects unknown fields", () => expectInvalid("PATCH", "/goals/g1", { status: "active" }));

    it("rejects a bad goal id", () =>
      expectInvalid("PATCH", "/goals/bad%20id", { payPreference: "cash" }, "id"));

    it("accepts clearing the user override", async () => {
      const res = await request("PATCH", "/goals/g1", { body: { userOverride: null } });
      expect(res.status).toBe(501);
    });

    it("accepts partial inputs", async () => {
      const res = await request("PATCH", "/goals/g1", { body: { inputs: { targetYear: 2030 } } });
      expect(res.status).toBe(501);
    });
  });

  describe("POST /uploads", () => {
    const valid = {
      name: "bca.pdf",
      type: "application/pdf",
      size: 1024,
      sourceKind: "bank",
      month: "2026-09",
    };

    it("rejects an unsupported file type", () =>
      expectInvalid("POST", "/uploads", { ...valid, type: "text/csv" }, "type"));

    it("rejects a file over 10 MB", () =>
      expectInvalid("POST", "/uploads", { ...valid, size: 10 * 1024 * 1024 + 1 }, "size"));

    it("rejects a bad month", () =>
      expectInvalid("POST", "/uploads", { ...valid, month: "09-2026" }, "month"));

    it("rejects an unknown source kind", () =>
      expectInvalid("POST", "/uploads", { ...valid, sourceKind: "crypto" }, "sourceKind"));
  });

  describe("POST /runs", () => {
    it("rejects an empty goal list", () =>
      expectInvalid(
        "POST",
        "/runs",
        { kind: "monthly", goalIds: [], month: "2026-09" },
        "goalIds",
      ));

    it("rejects an unknown kind", () =>
      expectInvalid(
        "POST",
        "/runs",
        { kind: "weekly", goalIds: ["g1"], month: "2026-09" },
        "kind",
      ));

    it("rejects a first run without documents", () =>
      expectInvalid("POST", "/runs", { kind: "first", goalIds: ["g1"], month: "2026-09" }));

    it("accepts a reuse run without documents", async () => {
      const res = await request("POST", "/runs", {
        body: { kind: "reuse", goalIds: ["g2"], month: "2026-09" },
      });
      expect(res.status).toBe(501);
    });
  });

  describe("PATCH /goals/:id/analyses/:month/choices", () => {
    it("rejects an unknown choice", () =>
      expectInvalid(
        "PATCH",
        "/goals/g1/analyses/2026-09/choices",
        { actionId: "a1", choice: "maybe" },
        "choice",
      ));

    it("rejects a bad month in the path", () =>
      expectInvalid(
        "PATCH",
        "/goals/g1/analyses/2026-13/choices",
        { actionId: "a1", choice: "committed" },
        "month",
      ));
  });

  describe("PUT /overrides/:ruleId", () => {
    it("rejects a missing value", () => expectInvalid("PUT", "/overrides/dti_cap", {}, "value"));

    it("rejects a string value", () =>
      expectInvalid("PUT", "/overrides/dti_cap", { value: "0.4" }, "value"));

    it("accepts null to clear", async () => {
      const res = await request("PUT", "/overrides/dti_cap", { body: { value: null } });
      expect(res.status).toBe(501);
      expect(await res.json()).toMatchObject({ accepted: { ruleId: "dti_cap", clears: true } });
    });
  });
});
