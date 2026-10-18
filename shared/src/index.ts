export * from "./demo/index.js";
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
export type * from "./types.js";
