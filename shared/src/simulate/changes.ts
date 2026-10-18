import type { Change } from "../types.js";
import { annuity } from "./money.js";
import type { LoopState } from "./simulate.js";

// The four change types of specs/02-simulate.md applied to the loop state at the start of a
// month, before that month is evaluated. Changes never read the clock: `fromMonth` is relative
// to the snapshot month (0).
//
// - refinance_loan: replaces the loan's rate and tenor at fromMonth; the new installment is the
//   annuity on the outstanding balance at that month. No-op when the loan is gone.
// - pay_off_loan: pays the outstanding from liquid savings in the first month >= fromMonth in
//   which liquid covers it, so a pay-off never pushes liquid negative.
// - cap_spending: caps one discretionary category from fromMonth on; several caps on the same
//   category keep the lowest.
// - move_assets: moves min(amount, volatile) from volatile to liquid at fromMonth.

export function applyChanges(state: LoopState, changes: Change[], month: number): void {
  for (const change of changes) {
    if (change.fromMonth !== month) continue;
    switch (change.type) {
      case "move_assets": {
        const moved = Math.min(Math.max(0, change.amount), state.volatile);
        state.volatile -= moved;
        state.liquid += moved;
        break;
      }
      case "cap_spending": {
        const current = state.caps[change.category];
        state.caps[change.category] =
          current === undefined ? change.monthlyCap : Math.min(current, change.monthlyCap);
        break;
      }
      case "refinance_loan": {
        const loan = state.loans.find((l) => l.id === change.loanId);
        if (!loan || loan.remainingMonths <= 0 || loan.outstanding <= 0) break;
        if (change.newTenorMonths < 1) break;
        loan.annualRate = change.newAnnualRate;
        loan.remainingMonths = change.newTenorMonths;
        loan.installment = annuity(loan.outstanding, change.newAnnualRate, change.newTenorMonths);
        break;
      }
      case "pay_off_loan":
        break; // handled below: it may wait for the money
    }
  }

  // Pay-offs: every month from fromMonth on, pay as soon as liquid covers the balance.
  for (const change of changes) {
    if (change.type !== "pay_off_loan" || change.fromMonth > month) continue;
    const index = state.loans.findIndex((l) => l.id === change.loanId);
    const loan = state.loans[index];
    if (!loan) continue;
    if (loan.remainingMonths <= 0 || loan.outstanding <= 0) {
      state.loans.splice(index, 1);
      continue;
    }
    if (state.liquid < loan.outstanding) continue;
    state.liquid -= loan.outstanding;
    state.loans.splice(index, 1);
  }
}
