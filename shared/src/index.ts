export * from "./demo/index.js";
export {
  type BuildEstimateInput,
  buildEstimate,
  growthRuleFor,
  monthKeyOf,
  type PricedGoal,
  targetAtGoalDate,
  weddingSavingsTarget,
  yearsToGoal,
} from "./estimate.js";
export { formatRupiah, formatRupiahInput, parseRupiahInput } from "./format.js";
export {
  hasLongDigitRun,
  MASK,
  maskAccountNumber,
  maskDigitRuns,
  SENSITIVE_DIGIT_RUN,
} from "./mask.js";
export { firestorePaths, isMonthKey, MONTH_PATTERN } from "./paths.js";
export { effectiveAnnualRate, type FeeKind, type FeeStructure, type LoanFigures } from "./rates.js";
export { mergeRules, RULE_IDS, type RuleId, type Rules, requireRule } from "./rules.js";
export { amortizeOneMonth, annuity, grow, monthsBetween } from "./simulate/money.js";
export { DEFAULT_MAX_MONTHS, type SimulateInput, simulate } from "./simulate/simulate.js";
export {
  type BuildSnapshotInput,
  buildSnapshot,
  coefficientOfVariation,
  isActiveLoan,
  isLiquidHolding,
  missingSources,
  SOURCE_KINDS,
} from "./snapshot/build.js";
export {
  type ComputeMetricsInput,
  computeMetrics,
  METRIC_IDS,
  type MetricId,
  monthlySurplus,
} from "./snapshot/metrics.js";
export type * from "./types.js";
