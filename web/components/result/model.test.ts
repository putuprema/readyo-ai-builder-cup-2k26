import { demoAnalysis, demoGoal, formatRupiah } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import {
  assumptionRows,
  checkIn,
  eyebrow,
  leadingPath,
  loanBadge,
  metricRow,
  pathCards,
  subline,
} from "./model";

describe("result model over the demo analysis", () => {
  it("builds the eyebrow from the goal and its estimate", () => {
    expect(eyebrow(demoGoal)).toBe("Buy a house · Tangerang Selatan · target Rp 1.52 bn in 2028");
  });

  it("shows the same KPR installment on the path card as in the DTI sentence", () => {
    const [loan] = pathCards(demoGoal, demoAnalysis);
    const row = loan?.rows.find((r) => r.label === "Monthly installment today");
    const dti = demoAnalysis.metrics.find((m) => m.id === "dti");
    const installment = demoAnalysis.withoutPlan.loan?.timeline[0]?.installment ?? 0;
    expect(row?.value.startsWith(formatRupiah(installment))).toBe(true);
    expect(dti?.meaning).toContain(`installment of ${formatRupiah(installment)}`);
  });

  it("leads with the loan path for a loan preference and reads every figure from the analysis", () => {
    expect(leadingPath(demoGoal)).toBe("loan");
    const [loan, cash] = pathCards(demoGoal, demoAnalysis);
    expect(loan?.path).toBe("loan");
    expect(loan?.leading).toBe(true);
    expect(loan?.title).toBe("KPR path · your preference");
    // The demo plan makes the KPR approvable this month; 24 months without it. The badge names
    // what is missing instead of contradicting the "Now" under it.
    expect(loan?.badge).toEqual({ text: "Needs the plan", tone: "blocked" });
    expect(loan?.big.value).toBe("Now");
    expect(loan?.rows.map((r) => `${r.label}: ${r.value}`)).toEqual([
      "Without changes: 24 months",
      "Down payment needed (5%): Rp 67.5 m",
      "Monthly installment today: Rp 9.6 m / mo · 20 yrs",
    ]);
    expect(loan?.blockedBy).toEqual([
      "DTI 37% vs 35% cap",
      "Down payment Rp 14.2 m vs Rp 67.5 m needed",
    ]);
    expect(cash?.path).toBe("cash");
    expect(cash?.leading).toBe(false);
    expect(cash?.big).toEqual({ value: "13", unit: "years with the plan" });
    expect(cash?.rows[0]).toEqual({ label: "Without changes", value: "18 years" });
    expect(cash?.rows[1]).toEqual({ label: "Needed in 2028 money", value: "Rp 1.52 bn" });
  });

  it("puts the cash path first for a cash preference and alone for a wedding", () => {
    const cashGoal = { ...demoGoal, payPreference: "cash" as const };
    expect(pathCards(cashGoal, demoAnalysis)[0]?.path).toBe("cash");
    const weddingAnalysis = {
      ...demoAnalysis,
      withoutPlan: { ...demoAnalysis.withoutPlan, loan: undefined },
      withPlan: { ...demoAnalysis.withPlan, loan: undefined },
    };
    const cards = pathCards(demoGoal, weddingAnalysis);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.path).toBe("cash");
  });

  it("formats each metric by its id", () => {
    const rows = demoAnalysis.metrics.map(metricRow);
    expect(rows.map((r) => [r.label, r.you, r.rule, r.statusLabel])).toEqual([
      ["Verified net income", "Rp 28 m / mo", "—", "Passes"],
      ["Debt-to-income", "37%", "≤ 35%", "Blocks"],
      ["Emergency fund", "4.6 months", "≥ 3 months", "Passes"],
      ["Expensive debt", "Rp 12.4 m", "Rp 0 before applying", "Needs work"],
      ["Savings rate", "39%", "≥ 20%", "Passes"],
      ["Down payment progress", "21%", "100%", "Needs work"],
      ["Horizon vs risk", "72% volatile", "< 20% volatile", "Needs work"],
    ]);
    expect(rows[1]?.meaning).toBe(demoAnalysis.metrics[1]?.meaning);
  });

  it("writes the subline from the data month and whether anything blocks", () => {
    expect(subline(demoAnalysis, demoGoal)).toMatch(
      /^Based on September 2026 statements\. Some checks/,
    );
    const clean = {
      ...demoAnalysis,
      metrics: demoAnalysis.metrics.map((m) => ({ ...m, status: "passes" as const })),
    };
    // No metric blocks, but the no-change KPR is still not approvable (a rule such as the down
    // payment can block while its metric reads "Needs work"): never "Nothing blocks".
    expect(subline(clean, demoGoal)).toMatch(
      /A bank would not approve a KPR today without changes/,
    );
    const loan = clean.withoutPlan.loan;
    if (!loan) throw new Error("demo has a loan path");
    const approvable = {
      ...clean,
      withoutPlan: { ...clean.withoutPlan, loan: { ...loan, approvableToday: true } },
    };
    expect(subline(approvable, demoGoal)).toMatch(/Nothing blocks/);
  });

  it("words the loan badge so it never contradicts the plan's month", () => {
    expect(loanBadge(true, 0)).toEqual({ text: "Approvable today", tone: "passes" });
    expect(loanBadge(false, 0)).toEqual({
      text: "Needs the plan",
      tone: "blocked",
    });
    expect(loanBadge(false, 5)).toEqual({ text: "Not approvable today", tone: "blocked" });
    expect(loanBadge(false, null)).toEqual({ text: "Not approvable today", tone: "blocked" });
  });

  it("lists the assumptions the simulation used and the next check-in", () => {
    expect(assumptionRows(demoAnalysis)).toEqual([
      { label: "Property price growth", value: "6% / yr" },
      { label: "Emergency fund before applying", value: "3 months" },
      { label: "DTI cap used by banks", value: "35%" },
      { label: "Minimum DP, first home, new build", value: "5%" },
      { label: "KPR rate (fixed period)", value: "6.5%" },
    ]);
    expect(checkIn(demoAnalysis)).toEqual({
      uploadLabel: "Upload October",
      sentence:
        "Upload October's statements any time from 1 November. We'll show what moved, which actions you kept, and the revised month count.",
      nextMonth: "October",
    });
  });
});
