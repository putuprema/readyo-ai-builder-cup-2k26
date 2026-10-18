import type { DocumentRecord } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { mapExtraction } from "../extraction/extract.js";
import { sampleStatement } from "../extraction/samples.js";
import { normalize } from "./index.js";

// The whole of stage 3 over the sample bank statement plus a matching GoPay history, with the
// Flash tier faked: the acceptance criterion "BCA -> GoPay top-up: both legs own_transfer" at
// pipeline level, and the stats the run log reports.

const bank: DocumentRecord = {
  id: "doc_bank",
  name: "bca.pdf",
  type: "application/pdf",
  size: 1,
  sourceKind: "bank",
  month: "2026-09",
  status: "uploaded",
  createdAt: "2026-10-01T00:00:00.000Z",
};
const wallet: DocumentRecord = {
  ...bank,
  id: "doc_wallet",
  name: "gopay.png",
  sourceKind: "ewallet",
};

const walletHistory = {
  ...sampleStatement,
  institution: "GoPay",
  accountLabel: null,
  accountNumber: "081234567890",
  openingBalance: null,
  closingBalance: null,
  transactions: [
    {
      date: "2026-09-02",
      amount: 500_000,
      direction: "in" as const,
      counterparty: "BCA",
      description: "Top Up via BCA",
      balanceAfter: null,
    },
    {
      date: "2026-09-03",
      amount: 45_000,
      direction: "out" as const,
      counterparty: "GoFood",
      description: "GoFood - Kopi Kenangan",
      balanceAfter: null,
    },
  ],
  warnings: [],
};

const flash = {
  generateJson: async (request: { prompt: string }) => {
    const refs = [...request.prompt.matchAll(/^(r\d+) \|/gm)].map((m) => m[1]);
    return { items: refs.map((ref) => ({ ref, cls: "discretionary", category: "food_delivery" })) };
  },
};

describe("normalize", () => {
  it("classifies both legs of the BCA -> GoPay top-up as own_transfer and the rest by rule or model", async () => {
    const transactions = [
      ...mapExtraction(bank, sampleStatement).transactions,
      ...mapExtraction(wallet, walletHistory).transactions,
    ];
    const logs: string[] = [];
    const result = await normalize({ transactions }, flash, (m) => logs.push(m));

    const byDescription = new Map(result.transactions.map((t) => [t.rawDescription, t]));
    expect(byDescription.get("TRSF E-BANKING DB TOPUP GOPAY ****7890")?.cls).toBe("own_transfer");
    expect(byDescription.get("Top Up via BCA")?.cls).toBe("own_transfer");
    expect(
      byDescription.get("TRSF E-BANKING CR 0109/FTSCY/WS95051 GAJI SEPT PT MAJU JAYA"),
    ).toMatchObject({
      cls: "income",
      category: "salary",
    });
    expect(byDescription.get("BIAYA ADM")).toMatchObject({
      cls: "essential",
      category: "bank_fees",
    });
    expect(byDescription.get("GoFood - Kopi Kenangan")).toMatchObject({
      cls: "discretionary",
      category: "food_delivery",
      recurring: false,
    });
    expect(result.transactions.every((t) => t.cls !== undefined)).toBe(true);
    expect(result.stats).toEqual({
      input: 5,
      duplicatesRemoved: 0,
      ownTransferPairs: 1,
      ownTransfersByPattern: 0,
      classifiedByRule: 2,
      classifiedByModel: 1,
      classifiedByDefault: 0,
      recurring: 0,
    });
    expect(result.warnings).toEqual([]);
    expect(logs.at(-1)).toContain("normalized 5 rows");
  });

  it("removes duplicates before matching transfers", async () => {
    const once = mapExtraction(bank, sampleStatement).transactions;
    const again = mapExtraction({ ...bank, id: "doc_bank_2" }, sampleStatement).transactions;
    const result = await normalize({ transactions: [...once, ...again] }, flash);
    expect(result.stats.duplicatesRemoved).toBe(3);
    expect(result.transactions).toHaveLength(3);
  });
});
