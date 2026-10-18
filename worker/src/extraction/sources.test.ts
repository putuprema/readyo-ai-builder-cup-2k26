import { type DocumentRecord, hasLongDigitRun } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { classifyHolding, extractDocument, mapExtraction } from "./extract.js";
import { FakeModel } from "./fakes.js";
import { sampleLoanBill, samplePortfolio, sampleStatement } from "./samples.js";
import type { ExtractedHolding, InstrumentType } from "./schemas.js";
import { instrumentTypes } from "./schemas.js";

// specs/04-extraction.md task 3: e-wallet, PayLater/pinjol and investment through the same
// extraction path as the bank statement.

function document(overrides: Partial<DocumentRecord>): DocumentRecord {
  return {
    id: "doc_1",
    name: "file.png",
    type: "image/png",
    size: 50_000,
    sourceKind: "bank",
    month: "2026-09",
    status: "uploaded",
    createdAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

const png = { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mimeType: "image/png" };

describe("e-wallet screenshot", () => {
  const wallet = document({ id: "doc_wallet", name: "gopay.png", sourceKind: "ewallet" });

  it("uses the e-wallet prompt with the statement schema", async () => {
    const model = new FakeModel({
      ...sampleStatement,
      institution: "GoPay",
      accountLabel: null,
      accountNumber: "081234567890",
    });
    const result = await extractDocument({ document: wallet, file: png }, model);
    expect(model.requests[0]?.prompt).toContain("Top-ups from a bank");
    expect(model.requests[0]?.files?.[0]?.mimeType).toBe("image/png");
    expect(result.kind).toBe("ewallet");
    expect(result.transactions[0]?.sourceAccount).toBe("GoPay ****7890");
    expect(hasLongDigitRun(result)).toBe(false);
  });
});

describe("PayLater bill", () => {
  const paylater = document({ id: "doc_pl", name: "spaylater.png", sourceKind: "paylater" });

  it("produces exactly one Loan with the code-computed annual rate", async () => {
    const model = new FakeModel(sampleLoanBill);
    const result = await extractDocument({ document: paylater, file: png }, model);
    expect(model.requests[0]?.prompt).toContain("as one loan");
    expect(result.transactions).toEqual([]);
    expect(result.holdings).toEqual([]);
    expect(result.loans).toHaveLength(1);
    expect(result.loans[0]).toEqual({
      id: expect.stringMatching(/^loan_[0-9a-f]{5}(-[0-9a-f]{5}){3}$/),
      month: "2026-09",
      lender: "SPayLater",
      type: "paylater",
      outstandingPrincipal: 12_400_000,
      monthlyInstallment: 2_100_000,
      effectiveAnnualRate: 0.354,
      remainingTenorMonths: 6,
      sourceFileId: "doc_pl",
    });
    expect(result.warnings).toEqual([]);
    expect(result.meta.sourceAccount).toBe("SPayLater ****6789");
  });

  it("types a pinjol upload as pinjol", () => {
    const pinjol = document({ id: "doc_pj", sourceKind: "pinjol" });
    const result = mapExtraction(pinjol, { ...sampleLoanBill, lender: "Kredivo" });
    expect(result.loans[0]?.type).toBe("pinjol");
    expect(result.loans[0]?.lender).toBe("Kredivo");
  });

  it("falls back to the documented assumption when the bill shows no fee information", () => {
    const result = mapExtraction(paylater, {
      ...sampleLoanBill,
      fee: { kind: "unknown", value: null },
      monthlyInstallment: null,
    });
    expect(result.loans[0]?.effectiveAnnualRate).toBe(0.36);
    expect(result.loans[0]?.monthlyInstallment).toBe(0);
    expect(result.warnings).toEqual([
      "Monthly instalment not readable; recorded as 0",
      "No fee information on the bill; assumed 36% a year for paylater",
    ]);
  });

  it("derives the rate from the instalment when only the fee kind is unknown", () => {
    const result = mapExtraction(paylater, {
      ...sampleLoanBill,
      fee: { kind: "unknown", value: null },
    });
    expect(result.loans[0]?.effectiveAnnualRate).toBe(0.0323);
  });

  it("uses the total outstanding when the principal is not shown, with a warning", () => {
    const result = mapExtraction(paylater, { ...sampleLoanBill, outstandingPrincipal: null });
    expect(result.loans[0]?.outstandingPrincipal).toBe(13_100_000);
    expect(result.warnings).toContain(
      "Outstanding principal not shown; the total outstanding was used instead",
    );
  });

  it("assumes one month of tenor left when the bill does not say", () => {
    const result = mapExtraction(paylater, { ...sampleLoanBill, remainingTenorMonths: null });
    expect(result.loans[0]?.remainingTenorMonths).toBe(1);
    expect(result.warnings).toContain("Remaining tenor not shown; assumed 1 month(s)");
  });
});

describe("investment portfolio", () => {
  const investment = document({ id: "doc_inv", name: "bibit.png", sourceKind: "investment" });

  it("produces one Holding per row with values and volatile flags", async () => {
    const model = new FakeModel(samplePortfolio);
    const result = await extractDocument({ document: investment, file: png }, model);
    expect(model.requests[0]?.prompt).toContain("every holding");
    expect(result.holdings).toEqual([
      {
        id: expect.stringMatching(/^hold_[0-9a-f]{5}(-[0-9a-f]{5}){3}$/),
        month: "2026-09",
        instrument: "Sucorinvest Money Market Fund",
        provider: "Bibit",
        currentValue: 20_000_000,
        liquidityClass: "liquid",
        volatile: false,
        sourceFileId: "doc_inv",
      },
      expect.objectContaining({ instrument: "BBCA", currentValue: 10_000_000, volatile: true }),
      expect.objectContaining({ instrument: "BTC", currentValue: 8_000_000, volatile: true }),
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.meta).toMatchObject({
      institution: "Bibit",
      asOfDate: "2026-09-30",
      totalValue: 38_000_000,
    });
  });

  it("warns when the holdings do not add up to the printed total", () => {
    const result = mapExtraction(investment, { ...samplePortfolio, totalValue: 50_000_000 });
    expect(result.warnings).toContain("Holdings do not add up to the printed total value");
  });

  it("classifies every instrument type: crypto and stocks volatile, money market and deposits not", () => {
    const expected: Record<InstrumentType, [liquidity: string, volatile: boolean]> = {
      cash: ["cash", false],
      money_market_fund: ["liquid", false],
      fixed_income_fund: ["liquid", false],
      mixed_fund: ["liquid", true],
      equity_fund: ["liquid", true],
      stock: ["liquid", true],
      bond: ["liquid", false],
      deposit: ["locked", false],
      gold: ["liquid", true],
      crypto: ["liquid", true],
      other: ["liquid", true],
    };
    for (const type of instrumentTypes) {
      const { liquidityClass, volatile } = classifyHolding(type, null, "2026-09");
      expect([liquidityClass, volatile], type).toEqual(expected[type]);
    }
  });

  it("locks any holding whose lock-up ends after the analysis month", () => {
    expect(classifyHolding("bond", "2028-03-15", "2026-09").liquidityClass).toBe("locked");
    expect(classifyHolding("bond", "2026-09-15", "2026-09").liquidityClass).toBe("liquid");
    expect(classifyHolding("deposit", "2026-08-01", "2026-09").liquidityClass).toBe("locked");
  });

  it("masks digits in provider and instrument names", () => {
    const holding: ExtractedHolding = {
      ...(samplePortfolio.holdings[0] as ExtractedHolding),
      instrument: "Deposito 1234567890",
      instrumentType: "deposit",
    };
    const result = mapExtraction(investment, { ...samplePortfolio, holdings: [holding] });
    expect(result.holdings[0]?.instrument).toBe("Deposito ****7890");
    expect(hasLongDigitRun(result)).toBe(false);
  });
});
