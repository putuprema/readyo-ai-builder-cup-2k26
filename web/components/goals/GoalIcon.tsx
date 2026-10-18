import type { GoalType } from "@adidi/shared";

/** The goal type's line icon (house, car, rings). Decorative: the card title names the type. */
export function GoalIcon({
  type,
  size = 26,
  color = "#1F7A4D",
}: {
  type: GoalType;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {type === "house" && (
        <>
          <path d="M3 11 12 3l9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </>
      )}
      {type === "car" && (
        <>
          <path d="M5 13 7 7h10l2 6" />
          <path d="M3 13h18v5H3z" />
          <circle cx="7" cy="18" r="1.5" />
          <circle cx="17" cy="18" r="1.5" />
        </>
      )}
      {type === "wedding" && (
        <>
          <circle cx="9" cy="13" r="6" />
          <circle cx="15" cy="13" r="6" />
          <path d="m12 4 2-2" />
        </>
      )}
    </svg>
  );
}
