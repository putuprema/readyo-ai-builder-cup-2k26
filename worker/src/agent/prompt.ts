import { monthsBetween, requireRule } from "@adidi/shared";
import type { AgentContext } from "./context.js";
import {
  LIST_CATEGORIES_TOOL,
  LIST_LOANS_TOOL,
  MAX_FROM_MONTH,
  SIMULATE_TOOL,
  viewOf,
} from "./tools.js";

// Prompts for the propose → verify loop. The model sees a compact, numeric picture of the
// month and the baseline simulation, and is told the rules of the game: one candidate per
// simulate call, code decides what is kept, stop when the plan is complete.

export const AGENT_SYSTEM_INSTRUCTION = `You are the planning step of a financial readiness tool for people in Indonesia. A person has a savings or loan goal (a KPR house loan, a KKB car loan, or a wedding paid in cash). You look for up to three actions that make the goal ready sooner, and you prove each one with the ${SIMULATE_TOOL} tool, which plays the person's finances forward month by month with the action applied.

How to work:
- Propose one candidate change per ${SIMULATE_TOOL} call, using the exact ids and amounts from the data (call ${LIST_LOANS_TOOL} and ${LIST_CATEGORIES_TOOL} when you need them; the prompt already lists them).
- The tool answers with the simulation and whether the candidate was kept. Code decides that: a candidate is kept only if it brings the ready month forward on the leading path or clears a rule that fails in month 0. A dropped candidate is not part of the plan; try a different one or stop.
- A plan holds at most one spending cap, one move of volatile assets and one action per loan, so test in this order, skipping what does not apply:
  1. Expensive debt first (PayLater, pinjol, anything above the expensive-debt rate) when the goal has a loan path: pay_off_loan if liquid savings could cover it within a few months, otherwise refinance_loan to a cheaper rate with a tenor no longer than the months left. This is what moves the debt-to-income ratio.
  2. move_assets for the volatile assets when the goal is less than 36 months away: they count for nothing until moved.
  3. cap_spending on the biggest discretionary category, to a realistic level (never zero).
- A refinance must be cheaper than the current loan and should not stretch the debt much longer than it would last anyway: a longer tenor keeps the installment in the debt-to-income ratio for longer.
- Never propose an action listed as dismissed by the user.
- You have a budget of tool calls; stop as soon as three candidates are kept or nothing useful is left to test. When you stop, answer with one short sentence and no tool call.
- Do not write the plan text yourself; another step does that from the verified numbers.`;

export function agentPrompt(ctx: AgentContext): string {
  const s = ctx.snapshot;
  const baseline = viewOf(ctx, ctx.withoutPlan);
  const lines: string[] = [];

  lines.push(`Goal: ${goalLine(ctx)}.`);
  lines.push(`Leading path: ${ctx.leadingPath}. Snapshot month: ${s.month}.`);
  lines.push("");
  lines.push("Monthly figures (integer rupiah):");
  lines.push(`- net income ${s.netIncome}`);
  lines.push(`- essential spending ${s.essentialSpending}`);
  lines.push(
    `- discretionary spending ${s.discretionarySpending} by category: ${
      Object.entries(s.discretionaryByCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([c, v]) => `${c} ${v}`)
        .join(", ") || "none"
    }`,
  );
  lines.push(`- cash withdrawals ${s.cashWithdrawals}`);
  lines.push(`- debt payments ${s.debtPayments}`);
  lines.push(`- liquid savings ${s.liquidAssets}, volatile assets ${s.volatileAssets}`);
  lines.push("");
  lines.push(
    s.loans.length === 0
      ? "Loans: none."
      : `Loans: ${s.loans
          .map(
            (l) =>
              `${l.id} (${l.lender}, ${l.type}): outstanding ${l.outstandingPrincipal}, installment ${l.monthlyInstallment}/month, ${Math.round(l.effectiveAnnualRate * 1000) / 10}% a year, ${l.remainingTenorMonths} months left`,
          )
          .join("; ")}.`,
  );
  lines.push("");
  lines.push(`Rules: ${rulesLine(ctx)}.`);
  lines.push("");
  lines.push(`Baseline with no changes: ${baselineLine(baseline)}.`);
  if (ctx.dismissed.length > 0) {
    lines.push("");
    lines.push(
      `Dismissed by the user earlier (never propose these): ${ctx.dismissed
        .map((d) => [d.type, d.loanId, d.category].filter(Boolean).join(" "))
        .join("; ")}.`,
    );
  }
  lines.push("");
  lines.push(
    `Find up to three actions. Each ${SIMULATE_TOOL} call tests one candidate; fromMonth 0 means this month, at most ${MAX_FROM_MONTH}.`,
  );
  return lines.join("\n");
}

function goalLine(ctx: AgentContext): string {
  const g = ctx.goal;
  const target = g.estimate?.userOverride ?? g.estimate?.targetToday ?? 0;
  const monthsToGoal = monthsBetween(
    ctx.snapshot.month,
    g.type === "wedding"
      ? (g.inputs as { targetMonth: string }).targetMonth
      : `${(g.inputs as { targetYear: number }).targetYear}-12`,
  );
  switch (g.type) {
    case "house":
      return `a house (KPR), price today ${target}, goal date in ${monthsToGoal} months, pay preference ${g.payPreference}`;
    case "car":
      return `a car (KKB), price today ${target}, goal date in ${monthsToGoal} months, pay preference ${g.payPreference}`;
    case "wedding":
      return `a wedding paid in cash, cost today ${target} before the partner's and family's shares, in ${monthsToGoal} months`;
  }
}

function rulesLine(ctx: AgentContext): string {
  const r = ctx.rules;
  const parts = [
    `debt-to-income cap ${requireRule(r, "dti_cap")}`,
    `emergency fund ${requireRule(
      r,
      ctx.profile.employment === "freelance"
        ? "emergency_months_required_freelance"
        : "emergency_months_required",
    )} months of essential spending before applying`,
    `expensive debt above ${requireRule(r, "expensive_debt_rate")} a year`,
    `loan must end by age ${requireRule(r, "loan_end_age")} (the person is ${ctx.profile.age})`,
  ];
  return parts.join("; ");
}

function baselineLine(view: ReturnType<typeof viewOf>): string {
  const show = (m: number | null) => (m === null ? "not within 30 years" : `month ${m}`);
  const parts = [`cash path ready ${show(view.cash.monthsToReady)}`];
  if (view.loan) {
    parts.push(
      `loan path approvable ${show(view.loan.monthsToReady)}; today it fails ${
        view.loan.failingAtMonth0.length === 0
          ? "nothing"
          : view.loan.blockedBy
              .map((b) => `${b.rule} (you ${round(b.value)}, limit ${round(b.limit)})`)
              .join(", ")
      }`,
    );
  }
  return parts.join("; ");
}

function round(value: number): number {
  return Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 1000) / 1000;
}
