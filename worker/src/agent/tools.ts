import type { Change, LoanPathResult, SimulationResult } from "@adidi/shared";
import { z } from "zod";
import { geminiJsonSchema } from "../extraction/schemas.js";
import { type AgentContext, isDismissed, leadingMonths, simulateWith } from "./context.js";

// The three tools the agent may call (specs/06-agent.md, "Tools"). `simulate` wraps the real
// simulate() with the fixed inputs of the run; the two list tools are read-only views of the
// snapshot so the model proposes changes with real ids and amounts. Arguments arrive as the
// model's JSON and are validated here; a bad candidate is answered with an error message the
// model can act on, never thrown.

export const SIMULATE_TOOL = "simulate";
export const LIST_LOANS_TOOL = "list_loans";
export const LIST_CATEGORIES_TOOL = "list_spending_categories";

export const TOOL_NAMES = [SIMULATE_TOOL, LIST_LOANS_TOOL, LIST_CATEGORIES_TOOL] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** The latest month a proposed change may start in. */
export const MAX_FROM_MONTH = 12;
/** The longest refinance the model may propose, in months. */
export const MAX_REFINANCE_TENOR_MONTHS = 120;

const changeTypes = ["refinance_loan", "pay_off_loan", "cap_spending", "move_assets"] as const;

/** Flat argument shape: one object for every change type, so the schema stays in the subset
 *  Gemini's function declarations accept. The per-type rules are checked in code. */
export const simulateArgsSchema = z.object({
  type: z.enum(changeTypes).describe("The kind of change to test"),
  fromMonth: z
    .number()
    .int()
    .min(0)
    .max(MAX_FROM_MONTH)
    .describe("Month the change starts, 0 = this month"),
  loanId: z.string().optional().describe("refinance_loan, pay_off_loan: the id from list_loans"),
  newAnnualRate: z
    .number()
    .optional()
    .describe("refinance_loan: the new effective annual rate as a fraction, e.g. 0.13"),
  newTenorMonths: z.number().int().optional().describe("refinance_loan: the new tenor in months"),
  category: z
    .string()
    .optional()
    .describe("cap_spending: a category name from list_spending_categories"),
  monthlyCap: z
    .number()
    .int()
    .optional()
    .describe("cap_spending: the new monthly ceiling in rupiah, below the current spend"),
  amount: z
    .number()
    .int()
    .optional()
    .describe("move_assets: rupiah to move from volatile assets into liquid savings"),
});

export type SimulateArgs = z.infer<typeof simulateArgsSchema>;

/** The compact view of a simulation the model receives. Full results stay in code. */
export interface SimulationView {
  cash: { monthsToReady: number | null };
  loan?: {
    monthsToReady: number | null;
    approvableToday: boolean;
    failingAtMonth0: string[];
    blockedBy: LoanPathResult["blockedBy"];
  };
  /** "cash" or "loan": the path the headline reads. */
  leadingPath: "cash" | "loan";
  /** Months to ready on the leading path; null = not within the horizon. */
  leadingMonthsToReady: number | null;
}

export function viewOf(ctx: AgentContext, result: SimulationResult): SimulationView {
  return {
    cash: { monthsToReady: result.cash.monthsToReady },
    ...(result.loan
      ? {
          loan: {
            monthsToReady: result.loan.monthsToReady,
            approvableToday: result.loan.approvableToday,
            failingAtMonth0: result.loan.timeline[0]?.failing ?? [],
            blockedBy: result.loan.blockedBy,
          },
        }
      : {}),
    leadingPath: ctx.leadingPath,
    leadingMonthsToReady: leadingMonths(ctx, result),
  };
}

export type CandidateCheck = { ok: true; change: Change } | { ok: false; error: string };

/** Turn the model's arguments into a Change, or explain what is wrong with them. */
export function checkCandidate(ctx: AgentContext, raw: unknown): CandidateCheck {
  const parsed = simulateArgsSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Invalid arguments (${issues}).` };
  }
  const args = parsed.data;
  const built = buildChange(ctx, args);
  if (!built.ok) return built;
  if (isDismissed(ctx.dismissed, built.change)) {
    return {
      ok: false,
      error: "The user dismissed this action in an earlier month. Propose something else.",
    };
  }
  return built;
}

function buildChange(ctx: AgentContext, args: SimulateArgs): CandidateCheck {
  const { snapshot } = ctx;
  switch (args.type) {
    case "refinance_loan":
    case "pay_off_loan": {
      if (ctx.goal.type === "wedding") {
        return {
          ok: false,
          error:
            "This goal has no loan path, so loan actions are out of scope. Propose savings actions only (cap_spending, move_assets).",
        };
      }
      const loan = snapshot.loans.find((l) => l.id === args.loanId);
      if (!args.loanId || !loan) {
        return { ok: false, error: `Unknown loanId. Use an id from ${LIST_LOANS_TOOL}.` };
      }
      if (loan.remainingTenorMonths <= 0 || loan.outstandingPrincipal <= 0) {
        return { ok: false, error: `Loan ${loan.id} is already paid off.` };
      }
      if (args.type === "pay_off_loan") {
        return {
          ok: true,
          change: { type: "pay_off_loan", loanId: loan.id, fromMonth: args.fromMonth },
        };
      }
      const rate = args.newAnnualRate;
      const tenor = args.newTenorMonths;
      if (rate === undefined || !(rate > 0 && rate < 1)) {
        return {
          ok: false,
          error: "newAnnualRate must be a fraction between 0 and 1 (13% a year is 0.13).",
        };
      }
      if (rate >= loan.effectiveAnnualRate) {
        return {
          ok: false,
          error: `A refinance must be cheaper than the loan's current ${Math.round(loan.effectiveAnnualRate * 100)}% a year.`,
        };
      }
      if (tenor === undefined || tenor < 1 || tenor > MAX_REFINANCE_TENOR_MONTHS) {
        return {
          ok: false,
          error: `newTenorMonths must be between 1 and ${MAX_REFINANCE_TENOR_MONTHS}.`,
        };
      }
      return {
        ok: true,
        change: {
          type: "refinance_loan",
          loanId: loan.id,
          newAnnualRate: rate,
          newTenorMonths: tenor,
          fromMonth: args.fromMonth,
        },
      };
    }
    case "cap_spending": {
      const spent = args.category ? snapshot.discretionaryByCategory[args.category] : undefined;
      if (!args.category || spent === undefined) {
        return {
          ok: false,
          error: `Unknown category. Use a name from ${LIST_CATEGORIES_TOOL}.`,
        };
      }
      if (args.monthlyCap === undefined || args.monthlyCap < 0 || args.monthlyCap >= spent) {
        return {
          ok: false,
          error: `monthlyCap must be at least 0 and below the current ${spent} a month on ${args.category}.`,
        };
      }
      return {
        ok: true,
        change: {
          type: "cap_spending",
          category: args.category,
          monthlyCap: args.monthlyCap,
          fromMonth: args.fromMonth,
        },
      };
    }
    case "move_assets": {
      if (snapshot.volatileAssets <= 0) {
        return { ok: false, error: "There are no volatile assets to move." };
      }
      if (args.amount === undefined || args.amount <= 0 || args.amount > snapshot.volatileAssets) {
        return {
          ok: false,
          error: `amount must be between 1 and the ${snapshot.volatileAssets} held in volatile assets.`,
        };
      }
      return {
        ok: true,
        change: { type: "move_assets", amount: args.amount, fromMonth: args.fromMonth },
      };
    }
  }
}

export interface SimulateToolOutcome {
  change: Change;
  /** The candidate on its own against doing nothing. */
  alone: SimulationResult;
  /** The candidate added to the changes kept so far. */
  cumulative: SimulationResult;
}

export type SimulateToolResult =
  | { ok: true; outcome: SimulateToolOutcome }
  | { ok: false; error: string };

/** The `simulate` tool: validate the candidate, then run it alone and with the kept changes. */
export function simulateTool(ctx: AgentContext, kept: Change[], raw: unknown): SimulateToolResult {
  const check = checkCandidate(ctx, raw);
  if (!check.ok) return check;
  const alone = simulateWith(ctx, [check.change]);
  const cumulative = kept.length === 0 ? alone : simulateWith(ctx, [...kept, check.change]);
  return { ok: true, outcome: { change: check.change, alone, cumulative } };
}

export function listLoansTool(ctx: AgentContext) {
  return {
    loans: ctx.snapshot.loans.map((l) => ({
      id: l.id,
      lender: l.lender,
      type: l.type,
      outstandingPrincipal: l.outstandingPrincipal,
      monthlyInstallment: l.monthlyInstallment,
      effectiveAnnualRate: l.effectiveAnnualRate,
      remainingTenorMonths: l.remainingTenorMonths,
    })),
    debtPaymentsPerMonth: ctx.snapshot.debtPayments,
    loanPath: ctx.goal.type !== "wedding",
  };
}

export function listSpendingCategoriesTool(ctx: AgentContext) {
  const s = ctx.snapshot;
  return {
    categories: Object.entries(s.discretionaryByCategory)
      .map(([category, monthlySpend]) => ({ category, monthlySpend }))
      .sort((a, b) => b.monthlySpend - a.monthlySpend),
    discretionaryTotal: s.discretionarySpending,
    essentialSpending: s.essentialSpending,
    netIncome: s.netIncome,
    liquidAssets: s.liquidAssets,
    volatileAssets: s.volatileAssets,
  };
}

/** Function declarations in the shape @google/genai takes (`Tool.functionDeclarations`). */
export interface AgentFunctionDeclaration {
  name: ToolName;
  description: string;
  parametersJsonSchema?: Record<string, unknown>;
}

export function agentFunctionDeclarations(ctx: AgentContext): AgentFunctionDeclaration[] {
  const loanNote =
    ctx.goal.type === "wedding"
      ? "This goal is paid in cash and has no loan path: only cap_spending and move_assets are accepted."
      : "refinance_loan and pay_off_loan need a loanId from list_loans.";
  return [
    {
      name: SIMULATE_TOOL,
      description: `Test one candidate change by simulating the person's finances month by month with it added to the changes already kept. Returns months to ready on each path, whether a loan is approvable today and the rules failing in month 0, plus whether the candidate was kept. ${loanNote} fromMonth is relative to this month (0 to ${MAX_FROM_MONTH}).`,
      parametersJsonSchema: geminiJsonSchema(simulateArgsSchema),
    },
    {
      name: LIST_LOANS_TOOL,
      description:
        "The person's active loans with ids, lenders, balances, installments, effective annual rates and months left.",
    },
    {
      name: LIST_CATEGORIES_TOOL,
      description:
        "Discretionary spending by category this month, with the income, essential spending, liquid and volatile assets.",
    },
  ];
}
