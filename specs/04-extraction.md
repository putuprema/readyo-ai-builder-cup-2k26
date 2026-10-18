# 04 · Extraction and normalization (stages 2–3)

## Goal

Turn uploaded statements (bank PDF, e-wallet screenshot, PayLater bill, investment screenshot) into clean, classified `Transaction`, `Loan` and `Holding` records. This is the biggest quality risk in the project, so it is measured against hand-labelled fixtures.

## Depends on

01-contracts. Fixtures in `fixtures/statements/` and `fixtures/expected/`. Background: `docs/analysis.md` (stages 2–3).

## Behavior

**Extraction (Gemini, Pro tier)**

- One call per file, file sent as an image or PDF part.
- Structured output with a response schema per source kind (`bank`, `ewallet`, `paylater`, `investment`), matching the types in `shared/types`. No free-text parsing.
- The prompt states: Indonesian formats (`Rp 1.250.000`, `12/10/2026`, `DB`/`CR` markers), return amounts as integers in rupiah, never invent rows, mark unreadable fields as null.
- Account and card numbers are masked (keep last 4 digits) before anything is stored.
- Files live in the default bucket at `users/{uid}/documents/{docId}` (same path as the Firestore record). After a file is extracted successfully, delete it from Cloud Storage and set the `documents` record status to `extracted`. On failure, status `failed` with a `reason`, and the file is deleted as well: a failed source needs a fresh upload, and nothing keeps a statement longer than one run.
- Record ids are deterministic (hash of file id and row), so a retried task writes the same documents again instead of duplicating them; a document already `extracted` is not sent to the model again, its stored records are reused.
- Model ids come from env (`GEMINI_PRO_MODEL`, `GEMINI_FLASH_MODEL`) and default to the `gemini-pro-latest` and `gemini-flash-latest` aliases.
- When a bill gives no fee information at all, the rate comes from `worker/src/extraction/assumptions.json` (36% a year for PayLater, 48% for pinjol) and the loan carries a warning.
- **Unreadable file** (blurry screenshot, password-protected PDF, model refusal): continue with the readable files and flag the failed source; the result page shows it as missing. The run itself fails, with the user sent back to the documents step, only when no file could be read, or when the bank statement failed on a `first` run (there is no income to analyse without it).
- For loans, compute `effectiveAnnualRate` in code from the fee structure Gemini extracted (e.g. 2.95% per month → about 35% per year), not from the model.

**Normalization (code + Flash tier)**

1. **Dedup**: same date, amount and counterparty within one source → one transaction. A source is an account (`sourceAccount`); rows from the same file are never merged, since a statement does not repeat its own rows and two identical purchases on one day are real.
2. **Own-account transfers**: an `out` in one source and an `in` of the same amount in another source within 2 days → both `own_transfer`. Also known patterns (top-up to GoPay/OVO/ShopeePay, transfer to Bibit/Ajaib). A transfer from a bank or e-wallet to a known investment app is `own_transfer`, not `investment`: the money is still the user's. `investment` is kept for buy orders seen inside an investment account's own history.
3. **Classification** (Flash, batched 50 at a time, structured output): `income`, `essential`, `discretionary`, `debt_payment`, `investment`, plus a `category` (e.g. food_delivery, transport, groceries, rent, utilities, subscriptions, shopping, entertainment). Rules in code override the model where certain (salary credit → income, ATM withdrawal → cash, payment to a known PayLater → debt_payment).
4. **Recurring detection** in code: same counterparty and similar amount in 2+ months, or known subscription merchants.

## Acceptance criteria

Measured by a test script over `fixtures/` (results also go in the deck's benchmark slide):

- Transaction fields (date, amount, direction) correct on ≥ 95% of rows across the fixture statements.
- No invented rows: extracted row count never exceeds the expected count.
- PayLater fixture → exactly one `Loan` with outstanding and installment matching expected.
- Investment fixture → holdings with correct values and `volatile` flags (crypto and stocks volatile; money-market and deposits not).
- Fixture with a BCA → GoPay top-up: both legs classified `own_transfer`.
- No unmasked account numbers in stored records (test scans stored JSON for long digit runs).
- Raw file deleted from Cloud Storage after success (integration test).

## Tasks

1. Response schemas for the four source kinds.
2. Extraction call + masking + storage + file deletion, for the bank PDF fixture first.
3. Add e-wallet, PayLater, investment.
4. Dedup and own-transfer matching.
5. Classification with rule overrides.
6. Accuracy script over `fixtures/` printing a table.

## Out of scope

Email receipt import, handwritten notes, more than one bank format before M1 is done.
