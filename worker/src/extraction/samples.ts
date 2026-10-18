// Hand-made model outputs in the shape of the response schemas, used by tests and as the
// fake model's answers. Every number here is sample data.

import type { ExtractedLoanBill, ExtractedPortfolio, ExtractedStatement } from "./schemas.js";

export const sampleStatement: ExtractedStatement = {
  institution: "BCA",
  accountLabel: "Tahapan",
  accountNumber: "1234567890",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  openingBalance: 12_500_000,
  closingBalance: 9_830_000,
  transactions: [
    {
      date: "2026-09-01",
      amount: 15_000_000,
      direction: "in",
      counterparty: "PT MAJU JAYA",
      description: "TRSF E-BANKING CR 0109/FTSCY/WS95051 GAJI SEPT PT MAJU JAYA",
      balanceAfter: 27_500_000,
    },
    {
      date: "2026-09-02",
      amount: 500_000,
      direction: "out",
      counterparty: "GOPAY",
      description: "TRSF E-BANKING DB TOPUP GOPAY 081234567890",
      balanceAfter: 27_000_000,
    },
    {
      date: null,
      amount: 42_000,
      direction: "out",
      counterparty: "",
      description: "BIAYA ADM",
      balanceAfter: null,
    },
  ],
  warnings: ["Last row has no readable date"],
};

export const sampleLoanBill: ExtractedLoanBill = {
  lender: "SPayLater",
  productName: "SPayLater Cicilan 6x",
  accountNumber: "8800123456789",
  billMonth: "2026-09",
  outstandingPrincipal: 12_400_000,
  totalOutstanding: 13_100_000,
  monthlyInstallment: 2_100_000,
  dueDate: "2026-10-05",
  remainingTenorMonths: 6,
  totalTenorMonths: 6,
  fee: { kind: "monthly_rate", value: 0.0295 },
  lateFee: null,
  warnings: [],
};

export const samplePortfolio: ExtractedPortfolio = {
  provider: "Bibit",
  accountNumber: null,
  asOfDate: "2026-09-30",
  totalValue: 38_000_000,
  holdings: [
    {
      instrument: "Sucorinvest Money Market Fund",
      instrumentType: "money_market_fund",
      currentValue: 20_000_000,
      units: 12_345.678,
      unrealizedGainLoss: 350_000,
      lockedUntil: null,
    },
    {
      instrument: "BBCA",
      instrumentType: "stock",
      currentValue: 10_000_000,
      units: 1_000,
      unrealizedGainLoss: -200_000,
      lockedUntil: null,
    },
    {
      instrument: "BTC",
      instrumentType: "crypto",
      currentValue: 8_000_000,
      units: 0.0042,
      unrealizedGainLoss: 1_200_000,
      lockedUntil: null,
    },
  ],
  warnings: [],
};
