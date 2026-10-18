import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasLongDigitRun } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { EXPECTED_DIR, expectedFileSchema, loadFixtures } from "./fixtures.js";

// The hand-written expectations in fixtures/expected/ are checked offline: they must parse,
// pair with a statement when one is present locally, and never carry an account number.

const expectedFiles = existsSync(EXPECTED_DIR)
  ? readdirSync(EXPECTED_DIR).filter((f) => f.endsWith(".json"))
  : [];

describe("fixtures/expected", () => {
  it.each(expectedFiles)(
    "%s matches the expected-file schema and holds no long digit runs",
    (file) => {
      const raw = JSON.parse(readFileSync(join(EXPECTED_DIR, file), "utf8"));
      const parsed = expectedFileSchema.safeParse(raw);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(hasLongDigitRun(raw)).toBe(false);
    },
  );

  it("pairs every local statement that has an expected file", () => {
    const { fixtures, unmatched } = loadFixtures();
    for (const fixture of fixtures) {
      expect(fixture.document.sourceKind).toBe(fixture.expected.kind);
      expect(fixture.document.month).toBe(fixture.expected.month);
    }
    // Statements without expectations are allowed locally, just reported.
    expect(Array.isArray(unmatched)).toBe(true);
  });
});
