import {
  demoAnalysis,
  demoGoal,
  demoHoldings,
  demoLoans,
  demoMonth,
  demoTransactions,
} from "@adidi/shared";
import { describe, expect, it } from "vitest";
import {
  addedCount,
  addedCounter,
  canSubmitCheckIn,
  checkInFooter,
  checkInMonth,
  goalChip,
  institutionOf,
  missingHint,
  previousSubmitted,
  sourceRows,
} from "./model";

const records = { transactions: demoTransactions, loans: demoLoans, holdings: demoHoldings };

describe("checkInMonth", () => {
  it("asks for last month until it is submitted", () => {
    expect(checkInMonth(new Date("2026-11-01T08:00:00Z"), ["2026-09"])).toBe("2026-10");
    expect(checkInMonth(new Date("2026-11-01T08:00:00Z"), ["2026-09", "2026-10"])).toBeNull();
  });

  it("is up to date in the month after the latest submission", () => {
    expect(checkInMonth(new Date("2026-10-18T08:00:00Z"), ["2026-09"])).toBeNull();
  });

  it("takes a valid override for a month not submitted yet", () => {
    const today = new Date("2026-10-18T08:00:00Z");
    expect(checkInMonth(today, ["2026-09"], "2026-10")).toBe("2026-10");
    expect(checkInMonth(today, ["2026-09"], "2026-09")).toBeNull();
    expect(checkInMonth(today, ["2026-09"], "October")).toBeNull();
  });
});

describe("previousSubmitted", () => {
  it("is the latest month before the one being added", () => {
    expect(previousSubmitted(["2026-07", "2026-09", "2026-08"], "2026-10")).toBe("2026-09");
    expect(previousSubmitted(["2026-11"], "2026-10")).toBeNull();
  });
});

describe("sourceRows", () => {
  const rows = sourceRows(demoMonth, records);

  it("lists every source submitted last month in order", () => {
    expect(rows.map((r) => r.documentId)).toEqual([
      "doc-bca",
      "doc-gopay",
      "doc-kredivo",
      "doc-bibit",
      "doc-indodax",
    ]);
  });

  it("names each source from what was read, with the kind under it", () => {
    expect(rows[0]).toMatchObject({ title: "BCA", kindLabel: "Bank e-statement" });
    expect(rows[2]).toMatchObject({ title: "Kredivo", kindLabel: "PayLater bill" });
    expect(rows[3]).toMatchObject({ title: "Bibit", kindLabel: "Investment portfolio" });
  });

  it("says what each file contained", () => {
    const bca = demoTransactions.filter((t) => t.sourceFileId === "doc-bca").length;
    expect(rows[0]?.contents).toBe(`${bca} transactions`);
    expect(rows[2]?.contents).toBe("1 loan, Rp 12.4 m");
    expect(rows[3]?.contents).toBe("2 holdings, Rp 80 m");
  });

  it("falls back to the file name when nothing was read from a source", () => {
    const [row] = sourceRows(
      { sources: [{ kind: "ewallet", documentId: "d9", name: "OVO history.png" }] },
      { transactions: [], loans: [], holdings: [] },
    );
    expect(row).toMatchObject({ title: "OVO history", contents: "Read last month" });
  });
});

describe("institutionOf", () => {
  it("keeps the institution of a masked account label", () => {
    expect(institutionOf("BCA ****4821")).toBe("BCA");
    expect(institutionOf("Bank Jago ••••1234")).toBe("Bank Jago");
    expect(institutionOf("")).toBeUndefined();
  });
});

describe("goalChip", () => {
  it("shows months to the loan on the leading path", () => {
    const chip = goalChip(demoGoal, demoAnalysis);
    const months = (demoAnalysis.withChoices ?? demoAnalysis.withPlan).loan?.monthsToReady;
    expect(chip.label).toBe("Buy a house");
    expect(chip.headline).toBe(months === 0 ? "KPR this month" : `${months} mo to KPR`);
  });

  it("says when a goal has no analysis yet", () => {
    expect(goalChip(demoGoal, null).headline).toBe("Not analysed yet");
  });
});

describe("copy", () => {
  it("formats the counter, the footer and the missing hints", () => {
    expect(addedCounter(2, 4)).toBe("2 of 4 added");
    expect(checkInFooter(2, 2)).toBe("2 files added · updates 2 goals");
    expect(checkInFooter(1, 1)).toBe("1 file added · updates 1 goal");
    expect(checkInFooter(0, 1)).toBe("No files yet · updates 1 goal");
    expect(missingHint("paylater", "October")).toBe("Still paying it off? Add October's bill.");
  });
});

describe("uploads", () => {
  const rows = sourceRows(demoMonth, records);
  it("counts the rows that have this month's file", () => {
    const items = [
      { slot: "doc-bca", status: "uploaded" as const },
      { slot: "doc-gopay", status: "uploading" as const },
      { slot: "new", status: "uploaded" as const },
    ];
    expect(addedCount(rows, items)).toBe(1);
  });

  it("submits with sources missing once a file is in and nothing is in flight", () => {
    expect(canSubmitCheckIn([])).toBe(false);
    expect(canSubmitCheckIn([{ slot: "doc-bca", status: "uploaded" }])).toBe(true);
    expect(
      canSubmitCheckIn([
        { slot: "doc-bca", status: "uploaded" },
        { slot: "new", status: "uploading" },
      ]),
    ).toBe(false);
    expect(canSubmitCheckIn([{ slot: "doc-bca", status: "failed" }])).toBe(false);
  });
});
