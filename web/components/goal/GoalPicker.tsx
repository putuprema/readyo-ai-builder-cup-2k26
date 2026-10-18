import type { GoalType } from "@adidi/shared";
import Link from "next/link";

// "What are you working toward?": three cards, the selected one outlined in green. Selecting
// switches the form below and the URL (/goals/new?type=car). Car and wedding forms are M2,
// so their cards are shown but not yet selectable.

const OPTIONS: { type: GoalType; title: string; subtitle: string; available: boolean }[] = [
  { type: "house", title: "Buy a house", subtitle: "Cash or KPR", available: true },
  { type: "car", title: "Buy a car", subtitle: "Cash or KKB", available: false },
  { type: "wedding", title: "Wedding", subtitle: "Savings target", available: false },
];

function GoalIcon({ type }: { type: GoalType }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "house":
      return (
        <svg aria-hidden="true" {...common}>
          <path d="M3 11 12 4l9 7" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case "car":
      return (
        <svg aria-hidden="true" {...common}>
          <path d="M5 16 6.5 9h11L19 16" />
          <rect x="3" y="12" width="18" height="6" rx="2" />
          <circle cx="7.5" cy="18" r="1.5" />
          <circle cx="16.5" cy="18" r="1.5" />
        </svg>
      );
    case "wedding":
      return (
        <svg aria-hidden="true" {...common}>
          <circle cx="9" cy="13" r="5" />
          <circle cx="15" cy="13" r="5" />
          <path d="M12 4v4" />
        </svg>
      );
  }
}

export function GoalPicker({ selected, disabled }: { selected: GoalType; disabled?: boolean }) {
  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="m-0 font-bold text-[15px]">What are you working toward?</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const isSelected = option.type === selected;
          const className = `flex min-h-[88px] flex-col gap-2.5 rounded-[14px] bg-surface px-5 py-4 text-left text-ink no-underline ${
            isSelected
              ? "border-2 border-accent shadow-[0_0_0_4px_rgba(31,122,77,0.10)]"
              : "border border-line"
          }`;
          const body = (
            <>
              <span className={isSelected ? "text-accent-strong" : "text-muted"}>
                <GoalIcon type={option.type} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 font-bold text-[16px]">
                  {option.title}
                  {!option.available && (
                    <span className="rounded-full bg-page px-2 py-0.5 font-semibold text-[11px] text-muted">
                      Soon
                    </span>
                  )}
                </span>
                <span className="text-[13px] text-muted">{option.subtitle}</span>
              </span>
            </>
          );
          if (!option.available || disabled) {
            return (
              <span
                key={option.type}
                aria-disabled="true"
                aria-current={isSelected ? "true" : undefined}
                className={`${className} ${isSelected ? "" : "opacity-70"}`}
              >
                {body}
              </span>
            );
          }
          return (
            <Link
              key={option.type}
              href={`/goals/new/?type=${option.type}`}
              aria-current={isSelected ? "true" : undefined}
              className={className}
            >
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
