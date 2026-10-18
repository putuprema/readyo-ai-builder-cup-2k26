import type { Analysis, RuleEffect, SimulationResult } from "@adidi/shared";
import { formatRupiah, monthsCount, pct } from "./format";
import { optionLabel, ruleLabel, ruleUnit } from "./rule-labels";

// The "Also considered" card and the "Rules checked for this goal" table
// (docs/screens.md "3"; design artboard RulesPanel), from rulesChecked and rejectedOptions of
// the no-change simulation: today's numbers, formatted by the rule's unit.

export interface RuleRow {
  rule: string;
  label: string;
  valueUsed: string;
  you: string;
  effect: string;
  blocking: boolean;
}

type Checked = SimulationResult["rulesChecked"][number];
type Rejected = SimulationResult["rejectedOptions"][number];

function ratePct(rate: number): string {
  return `${(rate * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

function valueUsedText(r: Checked): string {
  if (r.rule === "loan_end_age") return `Age ${r.valueUsed}`;
  switch (ruleUnit(r.rule)) {
    case "ratio":
      return pct(r.valueUsed);
    case "rate":
      return `${ratePct(r.valueUsed)} / yr`;
    case "months":
      return monthsCount(r.valueUsed);
    case "years":
      return `${r.valueUsed} years`;
    case "rupiah":
      return r.rule.startsWith("flpp_income")
        ? `${formatRupiah(r.valueUsed)} / mo`
        : formatRupiah(r.valueUsed);
    default:
      return String(r.valueUsed);
  }
}

function youText(r: Checked): string {
  if (typeof r.you === "string") return r.you;
  if (r.rule === "dti_cap") return pct(r.you);
  if (r.rule.startsWith("min_dp_")) return `${formatRupiah(r.you)} needed`;
  if (r.rule === "loan_end_age") return `${r.you}-year tenor`;
  if (r.rule === "kpr_rate_fixed" || r.rule === "kkb_rate")
    return `${formatRupiah(r.you)} / mo installment`;
  if (r.rule.startsWith("emergency_months")) return monthsCount(r.you);
  if (r.rule.startsWith("growth_")) return `${formatRupiah(r.you)} today`;
  if (r.rule.startsWith("flpp_income")) return `${formatRupiah(r.you)} / mo`;
  if (r.rule === "kkb_max_tenor_years") return `${r.you}-year tenor`;
  return String(r.you);
}

function effectText(r: Checked, rejected: Rejected[]): string {
  const effects: Record<RuleEffect, () => string> = {
    blocks: () => "Blocks approval today",
    passes: () => "Passes",
    limits: () => "Limits your options",
    sets_target: () => {
      if (r.rule.startsWith("min_dp_")) return "Sets your down payment target";
      if (r.rule === "kpr_rate_fixed" || r.rule === "kkb_rate") return "Sets the installment";
      if (r.rule.startsWith("growth_")) return "Sets the price at your goal date";
      return "Sets a target";
    },
    rejects_option: () => {
      const options = rejected.filter((o) => o.rule === r.rule).map((o) => optionLabel(o.option));
      if (options.length === 0) return "Rejects an option";
      const list = options.join(" and ");
      return `${list.charAt(0).toUpperCase()}${list.slice(1)} rejected`;
    },
  };
  return effects[r.effect]();
}

export function ruleRows(analysis: Analysis): RuleRow[] {
  const result = analysis.withoutPlan;
  const rejected = analysis.rejectedOptions;
  const rows: RuleRow[] = result.rulesChecked.map((r) => ({
    rule: r.rule,
    label: ruleLabel(r.rule),
    valueUsed: valueUsedText(r),
    you: youText(r),
    effect: effectText(r, rejected),
    blocking: r.effect === "blocks",
  }));
  // Rejections by a rule the table does not hold (marital status, FLPP first-home rule).
  for (const o of rejected) {
    if (rows.some((row) => row.rule === o.rule)) continue;
    rows.push({
      rule: o.rule,
      label: ruleLabel(o.rule),
      valueUsed: "—",
      you: "—",
      effect: `${capitalize(optionLabel(o.option))} rejected: ${o.reason}`,
      blocking: false,
    });
  }
  return rows;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The one-line summary of the "Also considered" card, without the bold lead-in. */
export function alsoConsideredText(analysis: Analysis): string {
  const rejected = analysis.rejectedOptions;
  if (rejected.length === 0) {
    return "nothing else; every option the simulator tried is in the plan or passes the rules.";
  }
  return rejected
    .map((o) => `${optionLabel(o.option)} (${trimSentence(o.reason)})`)
    .join(", ")
    .concat(".");
}

/** "Subsidised KPR (FLPP) needs a monthly income of at most Rp 12,000,000." → "needs a monthly…" */
function trimSentence(reason: string): string {
  const text = reason.replace(/\.$/, "");
  const verb = /\b(needs?|is|are|would|run|runs|ends?)\b/.exec(text);
  if (verb && verb.index > 0) return text.slice(verb.index);
  return text.charAt(0).toLowerCase() + text.slice(1);
}
