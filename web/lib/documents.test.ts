import { describe, expect, it } from "vitest";
import {
  canSubmit,
  defaultMonth,
  describeFile,
  footerLine,
  initialKind,
  monthLabel,
  monthOptions,
  normalizedType,
  rejectReason,
  type UploadItem,
} from "./documents";

const NOW = new Date("2026-10-18T10:00:00Z");

function item(partial: Partial<UploadItem>): UploadItem {
  return {
    localId: "x",
    card: "bank",
    sourceKind: "bank",
    name: "f.pdf",
    type: "application/pdf",
    size: 1000,
    status: "uploaded",
    progress: 100,
    ...partial,
  };
}

describe("rejectReason", () => {
  it("accepts PDF, PNG and JPG up to 10 MB", () => {
    expect(rejectReason({ name: "a.pdf", type: "application/pdf", size: 10 * 1024 * 1024 })).toBe(
      null,
    );
    expect(rejectReason({ name: "a.png", type: "image/png", size: 10 })).toBe(null);
    expect(rejectReason({ name: "a.jpg", type: "image/jpeg", size: 10 })).toBe(null);
  });
  it("refuses other types, oversize and empty files", () => {
    expect(rejectReason({ name: "a.csv", type: "text/csv", size: 10 })).toMatch(/PDF, PNG and JPG/);
    expect(
      rejectReason({ name: "a.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1 }),
    ).toMatch(/10 MB/);
    expect(rejectReason({ name: "a.pdf", type: "application/pdf", size: 0 })).toMatch(/empty/);
  });
  it("falls back to the extension when the browser gives no type", () => {
    expect(normalizedType({ name: "scan.JPG", type: "" })).toBe("image/jpeg");
    expect(normalizedType({ name: "x.heic", type: "" })).toBe(null);
  });
});

describe("initialKind", () => {
  it("starts an e-wallet history in the bank card as E-wallet", () => {
    expect(initialKind("bank", "sample_ewallet_sep_2026.pdf")).toBe("ewallet");
    expect(initialKind("bank", "OVO history.png")).toBe("ewallet");
    expect(initialKind("bank", "sample_bank_sep_2026.pdf")).toBe("bank");
    expect(initialKind("bank", "BCA e-statement.pdf")).toBe("bank");
    expect(initialKind("bank", "DANA_sep.png")).toBe("ewallet");
    expect(initialKind("bank", "pendanaan.pdf")).toBe("bank");
  });

  it("keeps a GoPayLater bill a PayLater, and spots a pinjol by name", () => {
    expect(initialKind("loans", "GoPayLater Sep.png")).toBe("paylater");
    expect(initialKind("loans", "Kredit Pintar bill.pdf")).toBe("pinjol");
    expect(initialKind("investments", "Bibit.png")).toBe("investment");
  });
});

describe("canSubmit", () => {
  it("needs an uploaded bank or e-wallet file", () => {
    expect(canSubmit([])).toBe(false);
    expect(canSubmit([item({ card: "loans", sourceKind: "paylater" })])).toBe(false);
    expect(canSubmit([item({ card: "bank", sourceKind: "ewallet" })])).toBe(true);
  });
  it("waits for uploads and removals in flight", () => {
    expect(canSubmit([item({}), item({ localId: "y", status: "uploading", progress: 40 })])).toBe(
      false,
    );
    expect(canSubmit([item({}), item({ localId: "y", status: "removing" })])).toBe(false);
    expect(canSubmit([item({}), item({ localId: "y", status: "failed" })])).toBe(true);
  });
});

describe("footerLine", () => {
  it("counts ready files and says what is missing", () => {
    expect(footerLine([])).toBe("No files yet");
    expect(footerLine([item({ card: "loans" })])).toMatch(/add a bank or e-wallet statement/);
    expect(footerLine([item({}), item({ localId: "y", card: "loans" })])).toBe(
      "2 files added · ready to submit",
    );
    expect(footerLine([item({}), item({ localId: "y", status: "uploading" })])).toBe(
      "1 of 2 files uploaded",
    );
  });
});

describe("months and sizes", () => {
  it("defaults to last month and offers the two before it", () => {
    expect(defaultMonth(NOW)).toBe("2026-09");
    expect(monthOptions(NOW)).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(monthLabel("2026-09")).toBe("September 2026");
  });
  it("describes a file like the design", () => {
    expect(describeFile({ type: "application/pdf", size: 412 * 1024 })).toBe("PDF · 412 KB");
    expect(describeFile({ type: "image/png", size: 1.8 * 1024 * 1024 })).toBe("PNG · 1.8 MB");
  });
});
