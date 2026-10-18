import type { ActionCard as Action, ActionChoice } from "@adidi/shared";

// One action of the plan (docs/screens.md "3", "The plan"): undecided, committed (accent
// outline, the check line, Undo) or dismissed (collapsed dashed card, Skipped, the loss line,
// Undo). No badge on a committed card and no alternative after a skip.

export interface ActionCardProps {
  index: number;
  action: Action;
  choice: ActionChoice;
  /** "October": the month whose statements the committed action is checked against. */
  nextMonth: string;
  skippedLine: string;
  pending: boolean;
  onChoose(choice: ActionChoice): void;
}

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] px-3.5 font-semibold text-[13px] disabled:opacity-60";

export function ActionCard({
  index,
  action,
  choice,
  nextMonth,
  skippedLine,
  pending,
  onChoose,
}: ActionCardProps) {
  if (choice === "dismissed") {
    return (
      <li className="flex flex-col gap-4 rounded-2xl border-[1.5px] border-[#C9CFC9] border-dashed bg-[#FAFBF9] px-5 py-4 sm:flex-row sm:items-start sm:gap-5 sm:px-6">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-line font-extrabold text-muted"
        >
          {index}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="m-0 font-bold text-[15px] text-muted">{action.title}</h3>
            <span className="rounded-full bg-[#E9ECE7] px-2.5 py-[3px] font-bold text-[12px] text-muted">
              Skipped
            </span>
          </div>
          <p className="m-0 text-[14px] text-muted">{skippedLine}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onChoose("undecided")}
            className={`${BUTTON} border border-[#C9CFC9] bg-surface text-ink`}
          >
            Undo
          </button>
        </div>
      </li>
    );
  }

  const committed = choice === "committed";
  return (
    <li
      className={`flex flex-col gap-4 rounded-2xl bg-surface px-5 py-5 sm:flex-row sm:items-start sm:gap-5 sm:px-6 ${
        committed ? "border-2 border-accent" : "border border-line"
      }`}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-extrabold text-white"
      >
        {index}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 font-bold text-[16px]">{action.title}</h3>
          <span className="font-bold text-[13px] text-accent-strong tabular-nums">
            {action.impactLine}
          </span>
        </div>
        <p className="m-0 text-[14px] text-muted">{action.description}</p>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0 font-semibold text-[12px]">
          {action.chips.map((chip) => (
            <li key={chip} className="rounded-full bg-page px-2.5 py-1 text-ink">
              {chip}
            </li>
          ))}
        </ul>
        {committed && (
          <p className="m-0 flex items-center gap-2 text-[13px] text-accent-strong">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 12 5 5L20 7" />
            </svg>
            We'll check this in your {nextMonth} statements and tell you if it happened.
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:flex-col">
        {committed ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onChoose("undecided")}
            className={`${BUTTON} border border-[#C9CFC9] bg-surface text-ink`}
          >
            Undo
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => onChoose("committed")}
              className={`${BUTTON} bg-accent text-white`}
            >
              I'll do this
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onChoose("dismissed")}
              className={`${BUTTON} bg-transparent text-muted`}
            >
              Not for me
            </button>
          </>
        )}
      </div>
    </li>
  );
}
