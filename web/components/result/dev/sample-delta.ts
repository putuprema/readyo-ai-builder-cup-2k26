import type { MonthlyDelta } from "@adidi/shared";

// A hand-made delta in the shape the worker stores (specs/07-pipeline-runs.md, stage 7).
export const sampleDelta: MonthlyDelta = {
  previousMonth: "2026-09",
  metricsChanged: [
    {
      id: "dti",
      label: "Debt-to-income",
      oldValue: 0.38,
      newValue: 0.33,
      oldStatus: "blocks",
      newStatus: "passes",
    },
    {
      id: "emergency_fund",
      label: "Emergency fund",
      oldValue: 2.1,
      newValue: 2.6,
      oldStatus: "needs_work",
      newStatus: "needs_work",
    },
  ],
  committedActions: [
    {
      actionId: "a1",
      title: "Pay off Kredivo",
      change: { type: "pay_off_loan", loanId: "loan-kredivo", fromMonth: 0 },
      kept: true,
      evidence: "Kredivo balance gone",
    },
    {
      actionId: "a2",
      title: "Cap shopping at Rp 1.5 m",
      change: { type: "cap_spending", category: "shopping", monthlyCap: 1_500_000, fromMonth: 0 },
      kept: false,
      evidence: "Shopping Rp 1.9 m, above the Rp 1.5 m cap",
    },
  ],
  monthsToReady: { leadingPath: "loan", old: 14, new: 11 },
  summary: "Paying off Kredivo cleared the debt-to-income block. Approval moved 3 months closer.",
};
