import type { Analysis, Goal, HouseInputs, RunStatus } from "@adidi/shared";
import { formatRupiah } from "@adidi/shared";
import { goalSummary } from "../../lib/goal-summary";
import { monthName } from "../result/format";
import { goalWhen, leadingPath, loanProduct, pathCards } from "../result/model";
import { PIPELINE_STAGES, STAGE_COPY, stepNumber } from "../result/progress/stages";

// What each goals-list card shows (docs/screens.md "4"). Selection and formatting only: every
// number comes from the goal, its run document or its analysis (no arithmetic in the browser).

/** "Landed, 72/60 m², Tangerang Selatan · KPR · target Rp 1.52 bn in 2028". */
export function cardSummary(goal: Goal): string {
  if (goal.type !== "house") return goalSummary(goal);
  const inputs = goal.inputs as HouseInputs;
  const kind = inputs.propertyType === "apartment" ? "Apartment" : "Landed";
  const size =
    inputs.landM2 !== undefined && inputs.buildingM2 !== undefined
      ? `, ${inputs.landM2}/${inputs.buildingM2} m²`
      : inputs.buildingM2 !== undefined
        ? `, ${inputs.buildingM2} m²`
        : "";
  const pay = goal.payPreference === "cash" ? "cash" : loanProduct(goal);
  const price = goal.estimate?.userOverride ?? goal.estimate?.targetAtGoalDate;
  const target =
    price === undefined
      ? `no estimate yet · ${goalWhen(goal)}`
      : goal.status === "active"
        ? `target ${formatRupiah(price)} in ${goalWhen(goal)}`
        : `estimate ${formatRupiah(price)} · ${goalWhen(goal)}`;
  return `${kind}${size}, ${inputs.area} · ${pay} · ${target}`;
}

// ---- draft ----

export type SegmentState = "done" | "current" | "todo";

export interface DraftModel {
  step: 1 | 2;
  next: string;
  segments: [SegmentState, SegmentState, SegmentState];
  continueHref: string;
}

/** Steps: 1 goal and estimate, 2 documents, 3 readiness. A draft is at step 1 or 2. */
export function draftModel(goal: Goal): DraftModel {
  const step = goal.draftStep ?? (goal.estimate ? "documents" : "estimate");
  if (step === "documents") {
    return {
      step: 2,
      next: "Next: add documents",
      segments: ["done", "current", "todo"],
      continueHref: `/goals/${goal.id}/documents/`,
    };
  }
  return {
    step: 1,
    next: "Next: calculate the target",
    segments: ["current", "todo", "todo"],
    continueHref: `/goals/new/?id=${goal.id}`,
  };
}

// ---- analysing ----

export interface AnalysingModel {
  /** "Step 3 of 4 · Checking the rules", or "Starting" before the run document arrives. */
  stage: string;
  percent: number;
}

export function analysingModel(run: Pick<RunStatus, "stage" | "percent"> | null): AnalysingModel {
  if (!run) return { stage: "Starting", percent: 0 };
  const step = stepNumber(run.stage);
  const percent = Math.max(0, Math.min(100, Math.round(run.percent)));
  if (step === null) return { stage: "Stopped", percent };
  const name =
    run.stage === "done"
      ? "Finishing"
      : STAGE_COPY[PIPELINE_STAGES[step - 1] as (typeof PIPELINE_STAGES)[number]].name;
  return { stage: `Step ${step} of ${PIPELINE_STAGES.length} · ${name}`, percent };
}

// ---- active ----

export type StatusTone = "blocked" | "warning" | "passes";

export interface ActiveModel {
  /** The headline number, e.g. "14 mo" or "Now". */
  figure: string;
  /** Under it, e.g. "to a KPR with the plan". */
  unit: string;
  status: { text: string; tone: StatusTone };
  /** "September 2026 data". */
  dataMonth: string;
}

/** "14 mo"; "3 yrs" from 24 months up; null past the simulated horizon. */
function shortMonths(months: number | null): string {
  if (months === null) return "30+ yrs";
  if (months >= 24) return `${Math.round(months / 12)} yrs`;
  return `${months} mo`;
}

export function activeModel(goal: Goal, analysis: Analysis): ActiveModel {
  const cards = pathCards(goal, analysis);
  const plan = analysis.withChoices ?? analysis.withPlan;
  const without = analysis.withoutPlan;
  const dataMonth = `${monthName(analysis.month)} data`;
  const product = loanProduct(goal);

  if (leadingPath(goal) === "loan" && plan.loan && without.loan) {
    const months = plan.loan.monthsToReady;
    const loanCard = cards.find((c) => c.path === "loan");
    const status: ActiveModel["status"] = without.loan.approvableToday
      ? { text: `A bank would approve a ${product} today`, tone: "passes" }
      : {
          text: `Blocked today: ${(loanCard?.blockedBy ?? []).join(" · ") || "the lending rules"}`,
          tone: "blocked",
        };
    if (months === 0)
      return { figure: "Now", unit: `${product} approvable with the plan`, status, dataMonth };
    return {
      figure: shortMonths(months),
      unit:
        months === null
          ? `to a ${product}, not within the horizon`
          : `to a ${product} with the plan`,
      status,
      dataMonth,
    };
  }

  const months = plan.cash.monthsToReady;
  const status: ActiveModel["status"] =
    without.cash.monthsToReady === 0
      ? { text: "Ready in cash today", tone: "passes" }
      : {
          text: `${shortMonths(without.cash.monthsToReady)} if nothing changes`,
          tone: "warning",
        };
  const what = goal.type === "wedding" ? "to the savings target" : "to buy in cash";
  if (months === 0) return { figure: "Now", unit: "ready with the plan", status, dataMonth };
  return { figure: shortMonths(months), unit: `${what} with the plan`, status, dataMonth };
}
