import type { Transaction, TransactionClass } from "@adidi/shared";
import knownPatterns from "./known-patterns.json" with { type: "json" };
import { looksLikeOwnTransfer } from "./own-transfers.js";
import { containsAny, searchText } from "./text.js";

// Stage 3 step 3, the code side (specs/04-extraction.md): rules override the model where the
// answer is certain. Keyword lists live in known-patterns.json. Order matters: the first rule
// that matches wins, and a transaction a rule classified is not sent to the model.

export const categories = [
  "salary",
  "freelance",
  "interest",
  "refund",
  "other_income",
  "rent",
  "utilities",
  "insurance",
  "groceries",
  "health",
  "education",
  "transport",
  "fuel",
  "family",
  "bank_fees",
  "food_delivery",
  "dining",
  "shopping",
  "entertainment",
  "subscriptions",
  "travel",
  "charity",
  "other_spending",
  "installment",
  "investment",
  "own_transfer",
  "atm_withdrawal",
] as const;

export type Category = (typeof categories)[number];

export interface Classification {
  cls: TransactionClass;
  category: Category;
}

export interface RuleHit extends Classification {
  rule: string;
}

type Rule = (t: Transaction, text: string) => Classification | null;

const rules: [name: string, rule: Rule][] = [
  ["own_transfer", (t) => (looksLikeOwnTransfer(t) ? hit("own_transfer", "own_transfer") : null)],
  [
    "salary",
    (t, text) =>
      t.direction === "in" && containsAny(text, knownPatterns.salaryWords)
        ? hit("income", "salary")
        : null,
  ],
  [
    "interest",
    (t, text) =>
      t.direction === "in" && containsAny(text, knownPatterns.interestWords)
        ? hit("income", "interest")
        : null,
  ],
  [
    "atm",
    (t, text) =>
      t.direction === "out" && containsAny(text, knownPatterns.atmWords)
        ? hit("cash", "atm_withdrawal")
        : null,
  ],
  [
    "lender",
    (t, text) =>
      t.direction === "out" && containsAny(text, knownPatterns.lenders)
        ? hit("debt_payment", "installment")
        : null,
  ],
  [
    "installment",
    (t, text) =>
      t.direction === "out" && containsAny(text, knownPatterns.installmentWords)
        ? hit("debt_payment", "installment")
        : null,
  ],
  [
    "bank_fee",
    (t, text) =>
      t.direction === "out" && containsAny(text, knownPatterns.bankFeeWords)
        ? hit("essential", "bank_fees")
        : null,
  ],
  [
    "subscription",
    (t, text) =>
      t.direction === "out" && containsAny(text, knownPatterns.subscriptions)
        ? hit("discretionary", "subscriptions")
        : null,
  ],
  [
    "rent",
    (t, text) =>
      t.direction === "out" && containsAny(text, knownPatterns.rentWords)
        ? hit("essential", "rent")
        : null,
  ],
  [
    "insurance",
    (t, text) =>
      t.direction === "out" && containsAny(text, knownPatterns.insuranceWords)
        ? hit("essential", "insurance")
        : null,
  ],
  [
    "utility",
    (t, text) =>
      t.direction === "out" && containsAny(text, knownPatterns.utilityWords)
        ? hit("essential", "utilities")
        : null,
  ],
];

function hit(cls: TransactionClass, category: Category): Classification {
  return { cls, category };
}

/** The first rule that is certain about this transaction, or null to let the model decide. */
export function applyRules(t: Transaction): RuleHit | null {
  const text = searchText(t);
  for (const [name, rule] of rules) {
    const result = rule(t, text);
    if (result) return { ...result, rule: name };
  }
  return null;
}

/** A class the model may return but a rule would never have produced is still accepted. */
export const transactionClasses: readonly TransactionClass[] = [
  "income",
  "essential",
  "discretionary",
  "debt_payment",
  "investment",
  "own_transfer",
  "cash",
];
