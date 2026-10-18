import type { Override, RuleValue } from "@adidi/shared";
import { formatRupiah } from "@adidi/shared";

// 7 · Assumptions, read-only (docs/screens.md "7", specs/13-ui-monthly-assumptions.md): every
// rule from the `rules` collection, grouped, with its value in its unit, what it is used for,
// its source and the date it was checked. Formatting only; unit-tested.

export type GroupId = "lending" | "prices" | "savings" | "readiness";

export const GROUPS: { id: GroupId; title: string; subtitle: string }[] = [
  {
    id: "lending",
    title: "Lending rules",
    subtitle: "These decide whether a bank would approve your KPR or KKB, and in which month.",
  },
  {
    id: "prices",
    title: "Prices and rates",
    subtitle: "How your target and installment grow until the goal date.",
  },
  {
    id: "savings",
    title: "Savings returns",
    subtitle: "What money earns while it waits for the goal.",
  },
  {
    id: "readiness",
    title: "Readiness checks",
    subtitle: "Our own thresholds for the checks on the result page.",
  },
];

/** Where each rule is listed. A rule not named here goes to the readiness group. */
const GROUP_OF: Record<string, GroupId> = {
  dti_cap: "lending",
  min_dp_first_home_new: "lending",
  min_dp_other_home: "lending",
  loan_end_age: "lending",
  flpp_income_ceiling: "lending",
  flpp_income_ceiling_married: "lending",
  min_dp_kkb: "lending",
  kkb_max_tenor_years: "lending",
  emergency_months_required: "lending",
  emergency_months_required_freelance: "lending",
  kpr_rate_fixed: "prices",
  kpr_rate_floating: "prices",
  kpr_fixed_years: "prices",
  kkb_rate: "prices",
  growth_property: "prices",
  growth_car: "prices",
  growth_wedding: "prices",
  return_money_market: "savings",
  horizon_volatile_share_max: "savings",
};

export interface RuleRow {
  id: string;
  label: string;
  /** "35%", "6.5% / yr", "55 yrs", "3 mo", "Rp 12 m". */
  value: string;
  /** The user's override, when one is stored: the value the analysis uses. */
  override?: string;
  usedFor: string;
  source: { title: string; url: string | null };
  /** "18 Oct 2026". */
  checked: string;
}

export interface RuleGroup {
  id: GroupId;
  title: string;
  subtitle: string;
  rows: RuleRow[];
}

/** The groups in page order, each with its rules in the order of the collection; empty groups dropped. */
export function ruleGroups(
  rules: readonly RuleValue[],
  overrides: readonly Override[] = [],
): RuleGroup[] {
  const byRule = new Map(overrides.map((o) => [o.ruleId, o.value]));
  return GROUPS.map((group) => ({
    ...group,
    rows: rules
      .filter((r) => (GROUP_OF[r.id] ?? "readiness") === group.id)
      .map((r) => ruleRow(r, byRule.get(r.id))),
  })).filter((g) => g.rows.length > 0);
}

export function ruleRow(rule: RuleValue, override?: number): RuleRow {
  return {
    id: rule.id,
    label: rule.label,
    value: formatRuleValue(rule.unit, rule.value),
    ...(override !== undefined && override !== rule.value
      ? { override: formatRuleValue(rule.unit, override) }
      : {}),
    usedFor: usedForText(rule.usedFor),
    source: { title: rule.source.title, url: rule.source.url ? rule.source.url : null },
    checked: checkedDate(rule.checkedAt),
  };
}

export function formatRuleValue(unit: RuleValue["unit"], value: number): string {
  switch (unit) {
    case "ratio":
      return percent(value);
    case "rate":
      return `${percent(value)} / yr`;
    case "years":
      return `${value} ${value === 1 ? "yr" : "yrs"}`;
    case "months":
      return `${value} mo`;
    case "rupiah":
      return formatRupiah(value);
  }
}

/** 0.35 → "35%", 0.065 → "6.5%", 0.083 → "8.3%". */
function percent(ratio: number): string {
  return `${Number((ratio * 100).toFixed(1))}%`;
}

const USED_FOR: Record<string, string> = {
  kpr: "KPR",
  kkb: "KKB",
  cash: "cash path",
  house: "house goal",
  car: "car goal",
  wedding: "wedding goal",
  readiness: "readiness checks",
};

/** ["kpr", "kkb", "cash"] → "KPR, KKB and cash path". */
export function usedForText(usedFor: readonly string[]): string {
  const words = usedFor.map((u) => USED_FOR[u] ?? u);
  if (words.length === 0) return "—";
  const text =
    words.length === 1
      ? (words[0] as string)
      : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-18" → "18 Oct 2026"; anything else is shown as stored. */
export function checkedDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}
