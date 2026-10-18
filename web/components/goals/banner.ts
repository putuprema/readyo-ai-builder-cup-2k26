import { monthlyBannerFor, previousMonthKey } from "@adidi/shared";
import { monthShortName } from "../result/format";

// The monthly banner (docs/screens.md "4", rule in specs/07-pipeline-runs.md): from the 1st
// of month M+1 until month M is submitted. Shown only when there is an active goal to update.
// No date or deadline in the copy.

export interface BannerModel {
  month: string;
  title: string;
  body: string;
  cta: string;
  href: string;
}

export function bannerModel(
  today: Date,
  submittedMonths: readonly string[],
  activeGoals: number,
): BannerModel | null {
  if (activeGoals === 0) return null;
  const month = monthlyBannerFor(today, submittedMonths);
  if (!month) return null;
  const name = monthShortName(month);
  const previous = previousMonthKey(month);
  const who =
    activeGoals === 1
      ? "your active goal updates"
      : activeGoals === 2
        ? "both active goals update"
        : `all ${activeGoals} active goals update`;
  const since = submittedMonths.includes(previous)
    ? `, with what moved since ${monthShortName(previous)}`
    : "";
  return {
    month,
    title: `${name} is over: add its statements.`,
    body: `Upload once and ${who}${since}.`,
    cta: `Upload ${name}`,
    href: "/documents/",
  };
}
