// Ground truth for the synthetic demo statements (make-sample-statements.ts renders them and
// writes the matching expected JSON). One household, September 2026: a salaried employee with a
// PayLater instalment (see make-sample-paylater.ts), an e-wallet and a small portfolio.
// Every institution is fictional; merchants are real names, as on any statement. Every number
// is invented. Classes follow specs/04-extraction.md.

export const HOLDER = "Sari Wulandari";
export const MONTH = "2026-09";

export interface BankRow {
  date: string; // YYYY-MM-DD
  description: string;
  counterparty: string;
  amount: number;
  direction: "in" | "out";
  cls: string;
}

export const BANK = {
  name: "Bank Sejahtera",
  product: "Tabungan Sejahtera",
  accountNumber: "4511234567",
  openingBalance: 9_850_000,
  rows: [
    row(
      "2026-09-01",
      "TRSF E-BANKING CR 0109/FTSCY/WS95051 GAJI SEPT PT MAJU JAYA",
      "PT MAJU JAYA",
      15_000_000,
      "in",
      "income",
    ),
    row(
      "2026-09-01",
      "TRSF E-BANKING DB 0109/FTSCY/WS95051 SEWA KOST SEPT RATNA DEWI",
      "RATNA DEWI",
      3_000_000,
      "out",
      "essential",
    ),
    row(
      "2026-09-02",
      "TRSF E-BANKING DB 0209/FTSCY/WS95051 TOP UP SAKUPAY E-WALLET",
      "SAKUPAY",
      500_000,
      "out",
      "own_transfer",
    ),
    row(
      "2026-09-02",
      "TRSF E-BANKING DB 0209/FTSCY/WS95051 TUMBUH INVEST REKSA DANA",
      "TUMBUH INVEST",
      2_000_000,
      "out",
      "own_transfer",
    ),
    row("2026-09-03", "BIAYA LISTRIK PLN POSTPAID 5401234567", "PLN", 450_000, "out", "essential"),
    row(
      "2026-09-04",
      "TRSF E-BANKING DB 0409/FTSCY/WS95051 SPAYLATER TAGIHAN",
      "SPAYLATER",
      2_265_500,
      "out",
      "debt_payment",
    ),
    row("2026-09-06", "TARIKAN ATM 06/09 ATM BSD JUNCTION", "", 1_000_000, "out", "cash"),
    row("2026-09-07", "DB SUPERINDO BSD CITY", "SUPERINDO", 420_000, "out", "essential"),
    row("2026-09-08", "DB NETFLIX.COM", "NETFLIX", 186_000, "out", "discretionary"),
    row(
      "2026-09-16",
      "TRSF E-BANKING DB 1609/FTSCY/WS95051 UNTUK IBU SUMIATI",
      "SUMIATI",
      1_000_000,
      "out",
      "essential",
    ),
    row(
      "2026-09-19",
      "TRSF E-BANKING DB 1909/FTSCY/WS95051 TOP UP SAKUPAY E-WALLET",
      "SAKUPAY",
      300_000,
      "out",
      "own_transfer",
    ),
    row("2026-09-25", "DB TOKOPEDIA", "TOKOPEDIA", 1_250_000, "out", "discretionary"),
  ] as BankRow[],
};

function row(
  date: string,
  description: string,
  counterparty: string,
  amount: number,
  direction: "in" | "out",
  cls: string,
): BankRow {
  return { date, description, counterparty, amount, direction, cls };
}

export const EWALLET = {
  name: "SakuPay",
  phone: "0812 3456 7890",
  openingBalance: 62_500,
  rows: [
    row(
      "2026-09-02",
      "Top Up dari Bank Sejahtera",
      "Bank Sejahtera",
      500_000,
      "in",
      "own_transfer",
    ),
    row(
      "2026-09-03",
      "SakuFood - Ayam Geprek Bensu Serpong",
      "Ayam Geprek Bensu",
      45_000,
      "out",
      "discretionary",
    ),
    row("2026-09-05", "Pembayaran Bluebird Taksi", "Bluebird", 62_000, "out", "essential"),
    row(
      "2026-09-08",
      "Pembayaran Kopi Kenangan BSD",
      "Kopi Kenangan",
      38_000,
      "out",
      "discretionary",
    ),
    row("2026-09-11", "Cashback Promo September", "SakuPay", 5_000, "in", "income"),
    row("2026-09-15", "Pembayaran Alfamart Serpong Utara", "Alfamart", 87_500, "out", "essential"),
    row(
      "2026-09-19",
      "Top Up dari Bank Sejahtera",
      "Bank Sejahtera",
      300_000,
      "in",
      "own_transfer",
    ),
    row("2026-09-21", "Pulsa Telkomsel 0812****7890", "Telkomsel", 100_000, "out", "essential"),
    row("2026-09-27", "Pembayaran Indomaret Rawa Buntu", "Indomaret", 52_000, "out", "essential"),
  ] as BankRow[],
};

export interface HoldingRow {
  instrument: string;
  typeLabel: string; // as printed
  units: string; // as printed
  value: number;
  gain: number;
  lockedUntil?: string; // printed as maturity
  volatile: boolean;
  liquidityClass: "cash" | "liquid" | "locked";
  aliases?: string[];
}

export const PORTFOLIO = {
  name: "Tumbuh Invest",
  clientId: "TI-2026-884512",
  asOf: "30 September 2026",
  holdings: [
    {
      instrument: "Sejahtera Likuid Pasar Uang",
      typeLabel: "Reksa Dana Pasar Uang",
      units: "17.482,3011 unit",
      value: 25_000_000,
      gain: 612_000,
      volatile: false,
      liquidityClass: "liquid",
      aliases: ["Sejahtera Likuid"],
    },
    {
      instrument: "Nusantara Ekuitas Saham",
      typeLabel: "Reksa Dana Saham",
      units: "3.905,2201 unit",
      value: 8_500_000,
      gain: -420_000,
      volatile: true,
      liquidityClass: "liquid",
      aliases: ["Nusantara Ekuitas"],
    },
    {
      instrument: "ORI027",
      typeLabel: "Obligasi Negara Ritel",
      units: "10 unit",
      value: 10_000_000,
      gain: 0,
      lockedUntil: "15 Oktober 2029",
      volatile: false,
      liquidityClass: "locked",
      aliases: ["ORI 027", "Obligasi Negara Ritel"],
    },
    {
      instrument: "BBCA",
      typeLabel: "Saham",
      units: "300 lembar",
      value: 2_850_000,
      gain: 135_000,
      volatile: true,
      liquidityClass: "liquid",
      aliases: ["Bank Central Asia"],
    },
    {
      instrument: "Bitcoin",
      typeLabel: "Kripto",
      units: "0,0021 BTC",
      value: 3_650_000,
      gain: 940_000,
      volatile: true,
      liquidityClass: "liquid",
      aliases: ["BTC"],
    },
    {
      instrument: "Emas Digital",
      typeLabel: "Emas",
      units: "2,00 gram",
      value: 3_400_000,
      gain: 260_000,
      volatile: true,
      liquidityClass: "liquid",
      aliases: ["Emas"],
    },
  ] as HoldingRow[],
};

export function sumHoldings(): number {
  return PORTFOLIO.holdings.reduce((n, h) => n + h.value, 0);
}
