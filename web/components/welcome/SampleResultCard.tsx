import { demoActions, demoGoal, demoWithoutPlan, demoWithPlan, formatRupiah } from "@adidi/shared";
import { goalSummary } from "@/lib/goal-summary";

// The "What you'll get" card on the Welcome screen (docs/screens.md, "0"). Its numbers are the
// demo analysis from @adidi/shared, which is real simulate() output over sample data, so the
// example stays consistent with the engine. Marked as an example on the card itself.

const monthsWithPlan = demoWithPlan.loan?.monthsToReady ?? null;
const monthsWithout = demoWithoutPlan.loan?.monthsToReady ?? null;
const blockers = demoWithoutPlan.loan?.blockedBy ?? [];

function blockerText(b: { rule: string; value: number; limit: number }): string {
  switch (b.rule) {
    case "dti_cap":
      return `DTI ${Math.round(b.value * 100)}% vs ${Math.round(b.limit * 100)}% cap`;
    case "emergency_months_required":
      return `emergency fund ${b.value.toFixed(1)} months`;
    case "min_dp_first_home_new":
    case "min_dp":
      return `down payment ${formatRupiah(b.value)} of ${formatRupiah(b.limit)}`;
    default:
      return b.rule.replaceAll("_", " ");
  }
}

export function SampleResultCard() {
  return (
    <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-[18px] rounded-[20px] border border-line bg-surface p-6">
      <span className="font-bold text-[12px] text-muted uppercase tracking-[0.06em]">
        What you'll get
      </span>
      <div className="flex flex-col gap-1.5 rounded-[14px] bg-page px-[18px] py-4">
        <span className="text-[13px] text-muted">{goalSummary(demoGoal)}</span>
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold text-[40px] leading-none tracking-[-0.03em] tabular-nums">
            {monthsWithPlan === null ? "–" : monthsWithPlan === 0 ? "Now" : monthsWithPlan}
          </span>
          <span className="font-semibold text-[15px] text-muted">
            {monthsWithPlan === 0
              ? "ready for a KPR with the plan"
              : "months to a KPR with the plan"}
          </span>
        </div>
        <span className="text-[13px] text-muted">
          {monthsWithout === null ? "Not within 30 years" : `${monthsWithout} months`} if nothing
          changes
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[14px]">
        <li className="flex items-start gap-2.5">
          <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-blocked" />
          <span>
            <strong>Blocked by</strong> {blockers.map(blockerText).join(", ")}
          </span>
        </li>
        {demoActions.slice(0, 2).map((action, i) => (
          <li key={action.id} className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-passes" />
            <span>
              <strong>Action {i + 1}:</strong> {action.title}, {lowerFirst(action.impactLine)}
            </span>
          </li>
        ))}
      </ul>
      <span className="text-[12px] text-muted">
        Example result. Yours is built from your own statements.
      </span>
    </div>
  );
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
