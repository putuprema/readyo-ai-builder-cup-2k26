import type { Goal, MetricStatus, MonthlyDelta } from "@adidi/shared";
import { monthShortName, monthsText } from "./format";
import { loanProduct, metricRow, STATUS_LABEL } from "./model";

// "What moved since last month" on the result page (specs/13-ui-monthly-assumptions.md task 3),
// from the delta a monthly run stores on the new month's analysis (specs/07-pipeline-runs.md).
// Selection and formatting only.

export type Trend = "better" | "worse" | "same";

export interface DeltaView {
  /** "Since September". */
  title: string;
  summary: string;
  /** "Months to a KPR" / "Months to ready". */
  monthsLabel: string;
  monthsFrom: string;
  monthsTo: string;
  trend: Trend;
  /** "2 months sooner", "1 month later", "No change". */
  trendText: string;
  metrics: {
    id: string;
    label: string;
    from: string;
    to: string;
    fromStatus: MetricStatus;
    toStatus: MetricStatus;
    fromStatusLabel: string;
    toStatusLabel: string;
    statusChanged: boolean;
  }[];
  actions: { actionId: string; title: string; kept: boolean; evidence: string }[];
}

export function deltaView(goal: Goal, delta: MonthlyDelta): DeltaView {
  const { old, new: next, leadingPath } = delta.monthsToReady;
  const trend = trendOf(old, next);
  return {
    title: `Since ${monthShortName(delta.previousMonth)}`,
    summary: delta.summary,
    monthsLabel: leadingPath === "loan" ? `Months to a ${loanProduct(goal)}` : "Months to ready",
    monthsFrom: monthsText(old),
    monthsTo: monthsText(next),
    trend,
    trendText: trendText(old, next, trend),
    metrics: delta.metricsChanged
      .map((m) => {
        const value = (you: number, status: MetricStatus) =>
          metricRow({ id: m.id, label: m.label, you, status, meaning: "" }).you;
        return {
          id: m.id,
          label: m.label,
          from: value(m.oldValue, m.oldStatus),
          to: value(m.newValue, m.newStatus),
          fromStatus: m.oldStatus,
          toStatus: m.newStatus,
          fromStatusLabel: STATUS_LABEL[m.oldStatus],
          toStatusLabel: STATUS_LABEL[m.newStatus],
          statusChanged: m.oldStatus !== m.newStatus,
        };
      })
      // Older deltas may hold a value move that reads the same once formatted ("26% → 26%").
      .filter((m) => m.statusChanged || m.from !== m.to),
    actions: delta.committedActions.map((a) => ({
      actionId: a.actionId,
      title: a.title,
      kept: a.kept,
      evidence: a.evidence,
    })),
  };
}

/** Fewer months is better; reaching the goal at all (null → n) is better too. */
function trendOf(old: number | null, next: number | null): Trend {
  if (old === next) return "same";
  if (old === null) return "better";
  if (next === null) return "worse";
  return next < old ? "better" : "worse";
}

function trendText(old: number | null, next: number | null, trend: Trend): string {
  if (trend === "same") return "No change";
  if (old === null || next === null)
    return trend === "better" ? "Now within reach" : "Out of reach";
  const diff = Math.abs(old - next);
  return `${diff} ${diff === 1 ? "month" : "months"} ${trend === "better" ? "sooner" : "later"}`;
}
