import type { GoalChip } from "./model";

// "Updates" row (artboard 5): one chip per active goal with its current headline.

export function GoalChips({ chips }: { chips: GoalChip[] }) {
  return (
    <section aria-labelledby="updates" className="flex flex-wrap items-center gap-3">
      <h2 id="updates" className="m-0 font-bold text-[13px] text-muted">
        Updates
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
        {chips.map((chip) => (
          <li
            key={chip.goalId}
            className="inline-flex min-h-11 items-center gap-2.5 rounded-full border border-line bg-surface px-3.5 py-2 text-[14px]"
          >
            <GoalIcon type={chip.type} />
            <strong>{chip.label}</strong>
            <span className="text-muted">{chip.headline}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GoalIcon({ type }: { type: GoalChip["type"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#1F7A4D",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "shrink-0",
  };
  if (type === "wedding") {
    return (
      <svg aria-hidden="true" {...common}>
        <circle cx="9" cy="13" r="6" />
        <circle cx="15" cy="13" r="6" />
        <path d="m12 4 2-2" />
      </svg>
    );
  }
  if (type === "car") {
    return (
      <svg aria-hidden="true" {...common}>
        <path d="M5 16V11l2-5h10l2 5v5" />
        <path d="M3 16h18v3H3z" />
        <circle cx="7.5" cy="16" r="1.5" />
        <circle cx="16.5" cy="16" r="1.5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" {...common}>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}
