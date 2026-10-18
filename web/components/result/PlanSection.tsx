import type { Analysis, Goal } from "@adidi/shared";
import { ActionCard } from "./ActionCard";
import type { ChoicesState } from "./choices/useChoices";
import { planLine, skippedLine } from "./plan-line";

/** "The plan": the numbered action cards with their choices and the line that follows them. */
export function PlanSection({
  goal,
  analysis,
  choices,
  nextMonth,
  children,
}: {
  goal: Goal;
  analysis: Analysis;
  choices: ChoicesState;
  nextMonth: string;
  /** The "Also considered" card (task 4), rendered after the cards. */
  children?: React.ReactNode;
}) {
  const count = analysis.actions.length;
  const title =
    count === 0
      ? "The plan"
      : `The plan: ${count} ${count === 1 ? "action" : "actions"}, each checked by the simulator`;
  return (
    <section aria-labelledby="plan-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="plan-heading" className="m-0 font-bold text-[18px]">
            {title}
          </h2>
          <p className="m-0 text-[13px] text-muted" aria-live="polite">
            {planLine({
              goal,
              analysis,
              choices: choices.choices,
              monthsWithChoices: choices.monthsWithChoices,
            })}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint px-3 py-1.5 font-bold text-[12px] text-accent-strong">
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12 5 5L20 7" />
          </svg>
          Verified month by month
        </span>
      </div>
      {choices.error && (
        <p
          role="alert"
          className="m-0 rounded-[10px] bg-[#FDF2F0] px-3.5 py-2.5 text-[#8A1A12] text-[13px]"
        >
          {choices.error}
        </p>
      )}
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {analysis.actions.map((action, i) => (
          <ActionCard
            key={action.id}
            index={i + 1}
            action={action}
            choice={choices.choices[action.id] ?? "undecided"}
            nextMonth={nextMonth}
            skippedLine={skippedLine(action, goal)}
            pending={choices.pendingActionId === action.id}
            onChoose={(choice) => choices.setChoice(action.id, choice)}
          />
        ))}
      </ol>
      {children}
    </section>
  );
}
