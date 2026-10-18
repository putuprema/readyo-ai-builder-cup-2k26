# Fixtures

Test inputs for the pipeline. Never commit real account numbers or names.

- `statements/`: real statements from the team, anonymised (names and account numbers blacked out, amounts kept). Git ignores this folder: a statement that still shows a name, address or account number must never be committed. Once a file is anonymised, add it with `git add -f`. Target set for the first milestone: one bank e-statement PDF (e.g. BCA), one e-wallet history screenshot (e.g. GoPay), one PayLater bill screenshot, one investment portfolio screenshot.
- `expected/`: for each statement, the JSON you expect extraction to return, written by hand. Used by the extraction accuracy tests in `specs/04-extraction.md`.

## Pairing and format

A statement `statements/<name>.pdf|png|jpg` pairs with `expected/<name>.json`. A statement without an expected file is listed by the accuracy script but not measured. The expected file names the source kind and month, then the rows (`worker/src/fixtures.ts` has the schema):

```json
{
  "kind": "bank",
  "month": "2026-09",
  "transactions": [
    { "date": "2026-09-01", "amount": 15000000, "direction": "in", "counterparty": "PT MAJU JAYA", "cls": "income" },
    { "date": "2026-09-02", "amount": 500000, "direction": "out", "counterparty": "GOPAY", "cls": "own_transfer" }
  ],
  "loans": [
    { "lender": "SPayLater", "outstandingPrincipal": 12400000, "monthlyInstallment": 2100000, "remainingTenorMonths": 6 }
  ],
  "holdings": [
    { "instrument": "Sucorinvest Money Market Fund", "currentValue": 20000000, "volatile": false },
    { "instrument": "BTC", "currentValue": 8000000, "volatile": true }
  ]
}
```

Amounts are integers in rupiah (values with sen such as `19.196,99` round to the nearest rupiah: `19197`), dates are `YYYY-MM-DD`, `direction` is `in` or `out` as seen from the account. A holding printed in another currency gives `"currency": "USD"` and `"nativeValue": 4378.76` instead of `currentValue`; the pipeline converts with the rate in `worker/src/extraction/assumptions.json` and the scorer compares the printed value. `counterparty` and `cls` are optional; `cls` (`income`, `essential`, `discretionary`, `debt_payment`, `investment`, `own_transfer`, `cash`) feeds the classification check. A bank statement lists only transactions, a PayLater bill only one loan, a portfolio screenshot only holdings.

Run the measurement with a key in `worker/.env`: `pnpm --filter worker accuracy`. The live tests (`pnpm --filter worker test:live`, which loads `worker/.env`) check the yes/no criteria on the same files.
- `profiles/`: hand-made financial profiles used by `simulate()` tests (`specs/02-simulate.md`).
