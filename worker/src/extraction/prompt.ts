import type { SourceKind } from "@adidi/shared";

// Prompts for stage 2. The schema carries the field-level instructions; the prompt carries the
// reading rules that apply to Indonesian statements (specs/04-extraction.md, "Extraction").

export const EXTRACTION_SYSTEM_INSTRUCTION = `You read Indonesian personal finance documents and return their contents as JSON that matches the given schema exactly.

Rules:
- Indonesian number formats: "Rp 1.250.000", "1.250.000,00" and "1,250,000" all mean 1250000. Return every amount as an integer number of rupiah with no decimals, thousands separators or currency symbols. Round half-rupiah values to the nearest rupiah.
- Dates may be printed as "12/10/2026", "12-10-2026", "12 Okt 2026" or "12 Oktober 2026" and are day first. Return them as "YYYY-MM-DD". If a row shows only day and month, take the year from the statement period or the document header.
- "DB", "D", "Debit", "Keluar", "-" and red figures mean money going out (direction "out"). "CR", "K", "Kredit", "Masuk", "+" and green figures mean money coming in (direction "in").
- Never invent, merge or drop rows. Return exactly one entry per row printed in the document. If a document is empty, return an empty list.
- If a field cannot be read (blurred, cut off, hidden), set it to null. Do not guess.
- Copy descriptions and names exactly as printed, including abbreviations. Do not translate.
- Report anything that made the document hard to read in "warnings" as short English sentences.
- Return only the JSON.`;

const STATEMENT_PROMPT = `Extract every transaction from this statement.

- Include fees, admin charges, interest and tax rows: they are transactions too.
- "amount" is the absolute value of the row; the direction field says whether it went in or out.
- "counterparty" is the merchant, person or institution on the other side when the row names one (e.g. "GOPAY", "PT MAJU JAYA", "TOKOPEDIA"); otherwise an empty string.
- "balanceAfter" is the running balance printed on that row, if the statement shows one.
- "counterpartyIsAccountHolder" is true only when the counterparty printed on the row is the same person as the account holder named in the statement header (money moved between their own accounts); false for any other person, merchant or institution, and false for interest, fees and tax rows.
- "accountNumber" is the account or wallet number printed in the header, digits only.
- Use the running balance to check your work: opening balance plus credits minus debits must equal the closing balance. If they do not match, add a warning saying so.`;

const EWALLET_PROMPT = `${STATEMENT_PROMPT}

- Top-ups from a bank are direction "in". Payments, transfers to others and withdrawals are "out". Cashback and refunds are "in".
- E-wallet history screens often show one card per transaction; each card is one row.
- The wallet number is usually a phone number; return it as digits in "accountNumber".`;

const LOAN_BILL_PROMPT = `Extract this PayLater or online loan (pinjol) bill as one loan.

- "monthlyInstallment" is the amount due this billing period, including fees and interest.
- "outstandingPrincipal" is the principal still owed across all active instalments, excluding future fees and interest. If the bill lists several purchases on instalment, sum their remaining principal.
- "totalOutstanding" is the total still owed including fees and interest, if printed.
- Report the fee structure in "fee": the monthly interest or service rate if printed as a percentage per month (e.g. "2,95% per bulan" -> kind "monthly_rate", value 0.0295), a flat rupiah fee per month, a total fee over the tenor, "none" when the bill shows zero fees, or "unknown" when no fee information is visible.
- "remainingTenorMonths" counts this instalment and the ones after it. When the bill lists several items on instalment ("cicilan 3 dari 6", "4 cicilan tersisa"), use the largest number of instalments left among them; derive it from "ke-N dari M" (M - N + 1) when it is not printed directly.
- "totalTenorMonths" is the longest original tenor among the items, if printed.
- Late fees go in "lateFee", not in the instalment.`;

const PORTFOLIO_PROMPT = `Extract every holding shown in this investment portfolio screen.

- One entry per fund, stock, coin or product shown, with its current value as printed.
- "instrument": when both a ticker symbol and a name are printed, return "SYMBOL NAME" (e.g. "NVDA NVIDIA CORPORATION COM", "BBCA Bank Central Asia"); otherwise the name or symbol as printed.
- Classify each holding: money market fund ("pasar uang"), fixed income fund ("pendapatan tetap", "obligasi"), mixed fund ("campuran"), equity fund ("saham" fund), stock (individual ticker such as BBCA), bond (ORI, SBR, SR, FR series), deposit ("deposito"), gold ("emas"), crypto (BTC, ETH and other coins) or other.
- "lockedUntil" is the maturity or lock-up end date when the product has one (bonds, deposits); otherwise null.
- "totalValue" is the total portfolio value printed on the screen, if shown.
- "currency" is the ISO code the values are printed in (IDR, USD, SGD). Do not convert: return the printed value in its own currency, with decimals when the currency has them. When a screen shows both a foreign value and a rupiah value, return the rupiah value with currency IDR.
- A cash balance held at the broker (e.g. "Cash USD") is a holding of type cash.`;

export function extractionPrompt(kind: SourceKind): string {
  switch (kind) {
    case "bank":
      return STATEMENT_PROMPT;
    case "ewallet":
      return EWALLET_PROMPT;
    case "paylater":
    case "pinjol":
      return LOAN_BILL_PROMPT;
    case "investment":
      return PORTFOLIO_PROMPT;
  }
}
