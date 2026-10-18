import { hasLongDigitRun } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { holdingNameMatches } from "../accuracy/compare.js";
import { loadFixtures, readFixtureBytes } from "../fixtures.js";
import { createGeminiModel } from "../gemini/client.js";
import { extractDocument } from "./extract.js";

// Real Gemini calls over the team's anonymised statements (specs/04-extraction.md acceptance
// criteria). Skipped when there is no GEMINI_API_KEY or no fixture with an expected file, so
// `pnpm test` stays green offline. Run with: GEMINI_API_KEY=... pnpm --filter worker test live
//
// The field-accuracy table (>= 95% of rows) is produced by `pnpm --filter worker accuracy`
// (task 6); this file checks the per-fixture criteria that have a yes/no answer.

const { fixtures } = loadFixtures();
const enabled = Boolean(process.env.GEMINI_API_KEY) && fixtures.length > 0;

describe.skipIf(!enabled)("live extraction over fixtures", () => {
  const model = enabled ? createGeminiModel() : undefined;

  it.each(fixtures.map((f) => [f.name, f] as const))(
    "%s: never more rows than expected, right record kinds, no unmasked numbers",
    async (_name, fixture) => {
      if (!model) return;
      const result = await extractDocument(
        {
          document: fixture.document,
          file: { bytes: readFixtureBytes(fixture), mimeType: fixture.mimeType },
        },
        model,
      );
      expect(result.transactions.length).toBeLessThanOrEqual(fixture.expected.transactions.length);
      expect(result.loans.length).toBe(fixture.expected.loans.length);
      expect(result.holdings.length).toBeLessThanOrEqual(fixture.expected.holdings.length);
      expect(hasLongDigitRun(result)).toBe(false);

      // PayLater fixture: exactly one Loan with outstanding and instalment matching expected.
      for (const [i, loan] of fixture.expected.loans.entries()) {
        expect(result.loans[i]).toMatchObject({
          outstandingPrincipal: loan.outstandingPrincipal,
          monthlyInstallment: loan.monthlyInstallment,
        });
      }

      // Investment fixture: holdings with correct values and volatile flags.
      for (const expectedHolding of fixture.expected.holdings) {
        const found = result.holdings.find((h) =>
          holdingNameMatches(expectedHolding, h.instrument),
        );
        expect(found, expectedHolding.instrument).toBeDefined();
        if (expectedHolding.currency !== undefined) {
          expect(found?.currency).toBe(expectedHolding.currency);
          expect(found?.nativeValue).toBeCloseTo(expectedHolding.nativeValue ?? 0, 2);
        } else {
          expect(found?.currentValue).toBe(expectedHolding.currentValue);
        }
        expect(found?.volatile).toBe(expectedHolding.volatile);
      }
    },
    120_000,
  );
});
