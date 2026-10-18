import type { Rules } from "./rules.js";
import { requireRule } from "./rules.js";
import { grow, monthsBetween } from "./simulate/money.js";
import type { Estimate, GoalInputs, GoalType, WeddingInputs } from "./types.js";

// Stage 1 arithmetic (specs/05-pricing.md). Gemini estimates today's price and cites its
// sources; everything below is code over the rules table: the growth to the goal date and,
// for a wedding, the amount the person must save after the partner's and family's shares.

/** What the model returns after validation: today's price, the range it saw and its sources. */
export interface PricedGoal {
  targetToday: number;
  rangeLow: number;
  rangeHigh: number;
  sources: Estimate["sources"];
}

export interface BuildEstimateInput {
  type: GoalType;
  inputs: GoalInputs;
  priced: PricedGoal;
  /** Merged rule map (defaults plus the user's overrides), as simulate() takes it. */
  rules: Rules;
  /** ISO timestamp of the calculation; also decides "this year" for the growth horizon. */
  calculatedAt: string;
}

/** The growth rule each goal type is priced forward with. */
export function growthRuleFor(type: GoalType): "growth_property" | "growth_car" | "growth_wedding" {
  switch (type) {
    case "house":
      return "growth_property";
    case "car":
      return "growth_car";
    case "wedding":
      return "growth_wedding";
  }
}

/**
 * Years between the calculation and the goal date. House and car goals name a year, so the
 * horizon is whole years (2026 to 2028 is two years, whatever the month). A wedding names a
 * month, so the horizon is the exact number of months over twelve. Never negative.
 */
export function yearsToGoal(type: GoalType, inputs: GoalInputs, calculatedAt: string): number {
  const nowMonth = monthKeyOf(calculatedAt);
  if (type === "wedding") {
    const months = monthsBetween(nowMonth, (inputs as WeddingInputs).targetMonth);
    return Math.max(0, months) / 12;
  }
  const { targetYear } = inputs as { targetYear: number };
  const thisYear = Number(nowMonth.slice(0, 4));
  return Math.max(0, targetYear - thisYear);
}

/** Today's price grown for `years` at the rule's rate, rounded to the rupiah. */
export function targetAtGoalDate(
  targetToday: number,
  growthRatePerYear: number,
  years: number,
): number {
  return Math.round(grow(targetToday, growthRatePerYear, years * 12));
}

/** What the couple must save themselves: cost − partner's share − family contribution, never below zero. */
export function weddingSavingsTarget(
  cost: number,
  partnerShare: number,
  familyContribution: number,
): number {
  return Math.max(0, cost - partnerShare - familyContribution);
}

/** Assembles the Estimate stored on the goal from the model's priced result and the rules. */
export function buildEstimate(input: BuildEstimateInput): Estimate {
  const { type, inputs, priced, rules, calculatedAt } = input;
  const growthRatePerYear = requireRule(rules, growthRuleFor(type));
  const years = yearsToGoal(type, inputs, calculatedAt);
  const estimate: Estimate = {
    targetToday: priced.targetToday,
    rangeLow: priced.rangeLow,
    rangeHigh: priced.rangeHigh,
    growthRatePerYear,
    targetAtGoalDate: targetAtGoalDate(priced.targetToday, growthRatePerYear, years),
    sources: priced.sources.map((s) => ({ title: s.title, url: s.url, date: s.date })),
    inputsUsed: { ...inputs },
    calculatedAt,
  };
  if (type === "wedding") {
    const w = inputs as WeddingInputs;
    estimate.savingsTarget = weddingSavingsTarget(
      priced.targetToday,
      w.partnerShare,
      w.familyContribution,
    );
  }
  return estimate;
}

/** "YYYY-MM" of an ISO timestamp (UTC), the key the month arithmetic works in. */
export function monthKeyOf(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Bad timestamp: ${isoTimestamp}`);
  return date.toISOString().slice(0, 7);
}
