import {
  type Change,
  DEFAULT_MAX_MONTHS,
  type DismissedAction,
  type Goal,
  type Profile,
  type Rules,
  type SimulationResult,
  type Snapshot,
  simulate,
} from "@adidi/shared";

// The fixed inputs of one agent run (specs/06-agent.md, "Inputs to the agent"). Every tool
// call and every verification simulates over this same context, so the model can only vary
// the changes, never the snapshot, the goal or the rules.

export interface AgentInput {
  snapshot: Snapshot;
  profile: Profile;
  goal: Goal; // with estimate
  rules: Rules; // merged defaults + overrides
  /** The no-change simulation, when the caller already has it (stage 5). */
  withoutPlan?: SimulationResult;
  /** Actions the user dismissed in earlier months; never proposed again. */
  dismissed?: DismissedAction[];
  maxMonths?: number;
}

/** The path the headline and the keep rule read: cash for weddings and for a cash preference,
 *  the loan path otherwise (specs/11-ui-progress-result.md: "Loan path leads when the pay
 *  preference is loan or none; wedding has one savings path"). */
export type LeadingPath = "cash" | "loan";

export interface AgentContext {
  snapshot: Snapshot;
  profile: Profile;
  goal: Goal;
  rules: Rules;
  withoutPlan: SimulationResult;
  dismissed: DismissedAction[];
  maxMonths: number;
  leadingPath: LeadingPath;
}

export function leadingPathOf(goal: Goal): LeadingPath {
  return goal.type === "wedding" || goal.payPreference === "cash" ? "cash" : "loan";
}

export function createAgentContext(input: AgentInput): AgentContext {
  const maxMonths = input.maxMonths ?? DEFAULT_MAX_MONTHS;
  const withoutPlan =
    input.withoutPlan ??
    simulate({
      snapshot: input.snapshot,
      profile: input.profile,
      goal: input.goal,
      rules: input.rules,
      changes: [],
      maxMonths,
    });
  return {
    snapshot: input.snapshot,
    profile: input.profile,
    goal: input.goal,
    rules: input.rules,
    withoutPlan,
    dismissed: input.dismissed ?? [],
    maxMonths,
    leadingPath: leadingPathOf(input.goal),
  };
}

/** simulate() over the context with the given changes. */
export function simulateWith(ctx: AgentContext, changes: Change[]): SimulationResult {
  return simulate({
    snapshot: ctx.snapshot,
    profile: ctx.profile,
    goal: ctx.goal,
    rules: ctx.rules,
    changes,
    maxMonths: ctx.maxMonths,
  });
}

/** Months to ready on the leading path; null when never within the horizon. */
export function leadingMonths(ctx: AgentContext, result: SimulationResult): number | null {
  return ctx.leadingPath === "loan" && result.loan
    ? result.loan.monthsToReady
    : result.cash.monthsToReady;
}

/** The rule ids failing in month 0 on the leading path. */
export function failingAtMonth0(ctx: AgentContext, result: SimulationResult): string[] {
  const path = ctx.leadingPath === "loan" && result.loan ? result.loan : result.cash;
  return path.timeline[0]?.failing ?? [];
}

/** Whether a change is one the user dismissed before: same type and same loan or category. */
export function isDismissed(dismissed: DismissedAction[], change: Change): boolean {
  return dismissed.some((d) => d.type === change.type && targetOf(d) === targetOf(change));
}

/** The loan or category a change or a dismissal points at; move_assets has none. */
function targetOf(action: DismissedAction | Change): string {
  switch (action.type) {
    case "refinance_loan":
    case "pay_off_loan":
      return `loan:${action.loanId ?? ""}`;
    case "cap_spending":
      return `category:${action.category ?? ""}`;
    case "move_assets":
      return "volatile";
  }
}
