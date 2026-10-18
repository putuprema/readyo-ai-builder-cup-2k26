// The "you are here" chips of goal creation: 1 Goal · 2 Documents · 3 Readiness
// (docs/screens.md, "Global"). Done steps show a check, the current one is filled.

const STEPS = ["Goal", "Documents", "Readiness"] as const;

export function StepChips({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="m-0 flex list-none flex-wrap gap-2 p-0 font-semibold text-[13px]">
      {STEPS.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3;
        const state = step < current ? "done" : step === current ? "current" : "todo";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-2 ${
              state === "current"
                ? "bg-accent text-white"
                : state === "done"
                  ? "border border-line bg-surface text-accent-strong"
                  : "border border-line bg-surface text-muted"
            }`}
          >
            {state === "done" ? (
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12 5 5L20 7" />
              </svg>
            ) : (
              <span
                aria-hidden="true"
                className={`inline-flex size-5 items-center justify-center rounded-full text-[12px] ${
                  state === "current" ? "bg-white/25" : "bg-page"
                }`}
              >
                {step}
              </span>
            )}
            <span>
              <span className="sr-only">
                {state === "done" ? "Done: " : state === "current" ? "Current step: " : ""}
              </span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
