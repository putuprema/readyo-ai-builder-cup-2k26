import {
  annuity,
  type Change,
  formatRupiah,
  type Loan,
  type MonthState,
  monthlySurplus,
  pct,
  type SimulationResult,
} from "@adidi/shared";
import { type AgentContext, leadingMonths } from "./context.js";
import { type KeptAction, monthsSaved } from "./loop.js";

// Everything numeric on an action card is built here from the simulation results
// (specs/06-agent.md, "Cards"): monthsSaved, the impact fact, the chips and the facts the
// writer may quote. Gemini receives these strings and writes the prose around them.

const rp = formatRupiah;

export interface ActionFacts {
  id: string;
  change: Change;
  monthsSaved: number;
  /** The code-built impact sentence, e.g. "Approval 17 months sooner". */
  impact: string;
  chips: string[];
  /** Label → value, everything the writer may quote. Numbers in the card text must come from
   *  here, `impact` or `chips`. */
  facts: Record<string, string>;
}

export const RULE_LABELS: Record<string, string> = {
  dti_cap: "debt-to-income cap",
  emergency_months_required: "emergency fund rule",
  loan_end_age: "loan age limit",
  min_dp_first_home_new: "minimum down payment",
  min_dp_other_home: "minimum down payment",
  min_dp_kkb: "minimum down payment",
};

export function ruleLabel(rule: string): string {
  return RULE_LABELS[rule] ?? rule.replace(/_/g, " ");
}

/** "food_delivery" → "food delivery". */
export function categoryLabel(category: string): string {
  return category.replace(/_/g, " ");
}

export function productName(ctx: AgentContext): string {
  switch (ctx.goal.type) {
    case "house":
      return "KPR";
    case "car":
      return "KKB";
    case "wedding":
      return "wedding";
  }
}

/** "17 months", "1 month". */
export function monthsText(n: number): string {
  return `${n} ${n === 1 ? "month" : "months"}`;
}

export function timingChip(fromMonth: number): string {
  if (fromMonth === 0) return "Do this month";
  if (fromMonth === 1) return "From next month";
  return `From month ${fromMonth}`;
}

/** The impact fact for the leading path: finite gains as "sooner", a null baseline as the
 *  month reached, a kept-for-clearing-a-rule action as the rule it clears. */
export function impactText(ctx: AgentContext, kept: KeptAction): string {
  const word = ctx.leadingPath === "loan" ? "Approval" : "Ready";
  const { monthsBefore, monthsAfter, clearedRules } = kept.verification.alone;
  if (monthsAfter !== null && monthsBefore !== null && monthsAfter < monthsBefore) {
    return `${word} ${monthsText(monthsBefore - monthsAfter)} sooner`;
  }
  if (monthsAfter !== null && monthsBefore === null) {
    const when = monthsAfter === 0 ? "this month" : `in ${monthsText(monthsAfter)}`;
    return `${word} ${when}; not within 30 years without it`;
  }
  const first = clearedRules[0];
  return first ? `Clears the ${ruleLabel(first)} this month` : `${word} no sooner`;
}

export function buildActionFacts(ctx: AgentContext, kept: KeptAction, index: number): ActionFacts {
  const { change } = kept;
  const before = ctx.withoutPlan;
  const after = kept.alone;
  const impact = impactText(ctx, kept);
  const saved = monthsSaved(
    ctx,
    kept.verification.alone.monthsBefore,
    kept.verification.alone.monthsAfter,
  );
  const common: Record<string, string> = {
    goal: productName(ctx),
    impact,
    readyWithoutIt: showMonths(leadingMonths(ctx, before)),
    readyWithIt: showMonths(leadingMonths(ctx, after)),
    horizon: "30 years",
    timing: timingChip(change.fromMonth),
  };
  const dtiCap = ctx.rules.dti_cap;
  if (ctx.leadingPath === "loan" && dtiCap !== undefined) common.dtiCap = pct(dtiCap);

  let chips: string[];
  let facts: Record<string, string>;
  switch (change.type) {
    case "pay_off_loan": {
      const loan = loanOf(ctx, change.loanId);
      const interestSaved =
        loan.monthlyInstallment * loan.remainingTenorMonths - loan.outstandingPrincipal;
      const paidIn = executionMonth(before, after);
      facts = {
        ...common,
        lender: loan.lender,
        outstanding: rp(loan.outstandingPrincipal),
        installment: `${rp(loan.monthlyInstallment)} a month`,
        rate: `${pct(loan.effectiveAnnualRate)} a year`,
        monthsLeft: monthsText(loan.remainingTenorMonths),
        liquidSavings: rp(ctx.snapshot.liquidAssets),
        ...(interestSaved > 0 ? { interestSaved: rp(interestSaved) } : {}),
        ...(paidIn !== null ? { paidIn: paidIn === 0 ? "this month" : `month ${paidIn}` } : {}),
      };
      chips = [
        ...dtiChip(ctx, before, after),
        ...(interestSaved > 0 ? [`Interest saved ${rp(interestSaved)}`] : []),
        paidIn !== null && paidIn > 0
          ? `Paid off in month ${paidIn}`
          : timingChip(change.fromMonth),
      ];
      break;
    }
    case "refinance_loan": {
      const loan = loanOf(ctx, change.loanId);
      const newInstallment = Math.round(
        annuity(loan.outstandingPrincipal, change.newAnnualRate, change.newTenorMonths),
      );
      const interestSaved =
        loan.monthlyInstallment * loan.remainingTenorMonths -
        newInstallment * change.newTenorMonths;
      facts = {
        ...common,
        lender: loan.lender,
        outstanding: rp(loan.outstandingPrincipal),
        installment: `${rp(loan.monthlyInstallment)} a month`,
        rate: `${pct(loan.effectiveAnnualRate)} a year`,
        monthsLeft: monthsText(loan.remainingTenorMonths),
        newRate: `${pct(change.newAnnualRate)} a year`,
        newTenor: monthsText(change.newTenorMonths),
        newInstallment: `${rp(newInstallment)} a month`,
        ...(interestSaved > 0 ? { interestSaved: rp(interestSaved) } : {}),
      };
      chips = [
        `Installment ${rp(loan.monthlyInstallment)} → ${rp(newInstallment)}`,
        ...dtiChip(ctx, before, after),
        ...(interestSaved > 0 ? [`Interest saved ${rp(interestSaved)}`] : []),
        timingChip(change.fromMonth),
      ];
      break;
    }
    case "cap_spending": {
      const spent = ctx.snapshot.discretionaryByCategory[change.category] ?? 0;
      const savesPerMonth = Math.max(0, spent - change.monthlyCap);
      const s = ctx.snapshot;
      const surplusBefore = monthlySurplus(s);
      const rateBefore = s.netIncome > 0 ? surplusBefore / s.netIncome : 0;
      const rateAfter = s.netIncome > 0 ? (surplusBefore + savesPerMonth) / s.netIncome : 0;
      facts = {
        ...common,
        category: categoryLabel(change.category),
        spentNow: `${rp(spent)} a month`,
        cap: `${rp(change.monthlyCap)} a month`,
        savesPerMonth: `${rp(savesPerMonth)} a month`,
        savingsRate: `${pct(rateBefore)} → ${pct(rateAfter)}`,
        month: monthName(s.month),
      };
      chips = [
        `Saves ${rp(savesPerMonth)} a month`,
        `Savings rate ${pct(rateBefore)} → ${pct(rateAfter)}`,
        timingChip(change.fromMonth),
      ];
      break;
    }
    case "move_assets": {
      const s = ctx.snapshot;
      const total = s.liquidAssets + s.volatileAssets;
      const shareBefore = total > 0 ? s.volatileAssets / total : 0;
      const shareAfter = total > 0 ? Math.max(0, s.volatileAssets - change.amount) / total : 0;
      const m0Before = month0(ctx, before);
      const m0After = month0(ctx, after);
      facts = {
        ...common,
        amount: rp(change.amount),
        volatileAssets: rp(s.volatileAssets),
        liquidSavings: rp(s.liquidAssets),
        volatileShare: `${pct(shareBefore)} → ${pct(shareAfter)}`,
        emergencyFund: `${monthsText1(m0Before?.emergencyMonths ?? 0)} → ${monthsText1(m0After?.emergencyMonths ?? 0)}`,
      };
      chips = [`Volatile share ${pct(shareBefore)} → ${pct(shareAfter)}`];
      const inst = installmentChip(m0Before, m0After);
      if (inst) {
        chips.push(inst);
        facts.installment = inst.replace(/^Installment /, "");
      } else if (ctx.leadingPath === "loan") {
        chips.push(...dtiChip(ctx, before, after));
      }
      chips.push(timingChip(change.fromMonth));
      break;
    }
  }

  return {
    id: `a${index + 1}`,
    change,
    monthsSaved: saved,
    impact,
    chips: chips.slice(0, 3),
    facts,
  };
}

/** Every string a card's text may take numbers from. */
export function allowedTexts(facts: ActionFacts): string[] {
  return [facts.impact, ...facts.chips, ...Object.values(facts.facts)];
}

function loanOf(ctx: AgentContext, loanId: string): Loan {
  const loan = ctx.snapshot.loans.find((l) => l.id === loanId);
  if (!loan) throw new Error(`cards: unknown loan ${loanId}`);
  return loan;
}

function month0(ctx: AgentContext, result: SimulationResult): MonthState | undefined {
  return ctx.leadingPath === "loan" && result.loan
    ? result.loan.timeline[0]
    : result.cash.timeline[0];
}

/** "DTI 43% → 35%" when the month-0 DTI changes on the loan path. */
function dtiChip(ctx: AgentContext, before: SimulationResult, after: SimulationResult): string[] {
  if (ctx.leadingPath !== "loan") return [];
  const a = before.loan?.timeline[0]?.dti;
  const b = after.loan?.timeline[0]?.dti;
  if (a === undefined || b === undefined || pct(a) === pct(b)) return [];
  return [`DTI ${pct(a)} → ${pct(b)}`];
}

function installmentChip(
  before: MonthState | undefined,
  after: MonthState | undefined,
): string | undefined {
  const a = before?.installment;
  const b = after?.installment;
  if (a === undefined || b === undefined || rp(a) === rp(b)) return undefined;
  return `Installment ${rp(a)} → ${rp(b)}`;
}

/** The first month in which the action's debt payments drop below the baseline's. */
function executionMonth(before: SimulationResult, after: SimulationResult): number | null {
  for (const [i, state] of after.cash.timeline.entries()) {
    const base = before.cash.timeline[i];
    if (base && state.debtPayments < base.debtPayments) return i;
  }
  return null;
}

function showMonths(m: number | null): string {
  if (m === null) return "not within 30 years";
  return m === 0 ? "this month" : `month ${m}`;
}

/** 0.5 → "0.5 months", 3 → "3 months". */
function monthsText1(n: number): string {
  const shown = Number(n.toFixed(1));
  return `${shown} ${shown === 1 ? "month" : "months"}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-09" → "September". */
export function monthName(key: string): string {
  const index = Number(key.slice(5, 7)) - 1;
  return MONTH_NAMES[index] ?? key;
}
