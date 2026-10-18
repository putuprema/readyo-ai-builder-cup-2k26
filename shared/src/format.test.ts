import { describe, expect, it } from "vitest";
import { formatRupiah, formatRupiahInput, parseRupiahInput } from "./format.js";

describe("formatRupiah", () => {
  it.each([
    [1_520_000_000, "Rp 1.52 bn"],
    [1_350_000_000, "Rp 1.35 bn"],
    [1_000_000_000, "Rp 1 bn"],
    [304_000_000, "Rp 304 m"],
    [304_400_000, "Rp 304 m"],
    [12_500_000, "Rp 12.5 m"],
    [1_000_000, "Rp 1 m"],
    [320_000, "Rp 320 k"],
    [12_345, "Rp 12.3 k"],
    [1_000, "Rp 1 k"],
    [950, "Rp 950"],
    [0, "Rp 0"],
    [-1_200_000, "-Rp 1.2 m"],
  ])("formats %d as %s", (amount, expected) => {
    expect(formatRupiah(amount)).toBe(expected);
  });

  it("rounds non-integer input to whole rupiah first", () => {
    expect(formatRupiah(999.6)).toBe("Rp 1 k");
  });

  it("handles non-finite input without throwing", () => {
    expect(formatRupiah(Number.NaN)).toBe("Rp –");
  });
});

describe("formatRupiahInput", () => {
  it.each([
    [1_350_000_000, "1.350.000.000"],
    [304_000, "304.000"],
    [999, "999"],
    [0, "0"],
    [-2_500, "-2.500"],
  ])("formats %d as %s", (amount, expected) => {
    expect(formatRupiahInput(amount)).toBe(expected);
  });
});

describe("parseRupiahInput", () => {
  it.each([
    ["1.350.000.000", 1_350_000_000],
    ["1,350,000,000", 1_350_000_000],
    ["Rp 304.000", 304_000],
    ["Rp304000", 304_000],
    [" 950 ", 950],
    ["-2.500", -2_500],
  ])("parses %j as %d", (text, expected) => {
    expect(parseRupiahInput(text)).toBe(expected);
  });

  it.each([
    ["", null],
    ["abc", null],
    ["1,5 jt", null],
    ["Rp", null],
  ])("rejects %j", (text, expected) => {
    expect(parseRupiahInput(text)).toBe(expected);
  });

  it("round-trips with formatRupiahInput", () => {
    expect(parseRupiahInput(formatRupiahInput(1_350_000_000))).toBe(1_350_000_000);
  });
});
