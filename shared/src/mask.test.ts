import { describe, expect, it } from "vitest";
import { hasLongDigitRun, maskAccountNumber, maskDigitRuns } from "./mask.js";

describe("maskAccountNumber", () => {
  it.each([
    ["1234567890", "****7890"],
    ["1234 5678 9012 3456", "****3456"],
    ["4111-1111-1111-1111", "****1111"],
    ["081234567890", "****7890"],
    ["1234", "1234"],
    ["12", "12"],
    ["", ""],
    [null, ""],
    [undefined, ""],
    ["no digits", "no digits"],
  ])("masks %j as %j", (raw, expected) => {
    expect(maskAccountNumber(raw)).toBe(expected);
  });
});

describe("maskDigitRuns", () => {
  it("masks long digit runs inside text and keeps the last four digits", () => {
    expect(maskDigitRuns("TRSF E-BANKING DB TOPUP GOPAY 081234567890")).toBe(
      "TRSF E-BANKING DB TOPUP GOPAY ****7890",
    );
    expect(maskDigitRuns("TRSF KE 1234567890 BUDI SANTOSO")).toBe("TRSF KE ****7890 BUDI SANTOSO");
  });

  it("leaves short numbers such as dates and reference codes alone", () => {
    expect(maskDigitRuns("0109/FTSCY/WS95051 GAJI SEPT")).toBe("0109/FTSCY/WS95051 GAJI SEPT");
    expect(maskDigitRuns("12/10/2026 BIAYA ADM 15000")).toBe("12/10/2026 BIAYA ADM 15000");
  });

  it("masks several runs in one string", () => {
    expect(maskDigitRuns("1234567 to 7654321")).toBe("****4567 to ****4321");
  });
});

describe("hasLongDigitRun", () => {
  it("finds digit runs in nested string values", () => {
    expect(hasLongDigitRun({ a: [{ b: "acct 1234567890" }] })).toBe(true);
    expect(hasLongDigitRun({ a: [{ b: "acct ****7890" }] })).toBe(false);
  });

  it("ignores numeric values, which are amounts", () => {
    expect(hasLongDigitRun({ amount: 1_350_000_000, note: "ok" })).toBe(false);
  });

  it("handles null, primitives and cycles", () => {
    expect(hasLongDigitRun(null)).toBe(false);
    expect(hasLongDigitRun(12345678)).toBe(false);
    const cyclic: { self?: unknown; text: string } = { text: "fine" };
    cyclic.self = cyclic;
    expect(hasLongDigitRun(cyclic)).toBe(false);
  });
});
