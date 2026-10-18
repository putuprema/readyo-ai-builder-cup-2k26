import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { EXPECTED_DIR, STATEMENTS_DIR } from "../src/fixtures.js";
import {
  BANK,
  type BankRow,
  EWALLET,
  HOLDER,
  MONTH,
  PORTFOLIO,
  sumHoldings,
} from "./sample-data.js";

// Synthetic demo statements for the judges and the extraction fixtures: a bank e-statement, an
// e-wallet history and an investment portfolio, rendered from scripts/sample-data.ts, plus the
// expected JSON for each (fixtures/README.md). Everything is invented; the institutions are
// fictional so no real bank or app is imitated.
//
//   pnpm --filter worker fixtures:samples

mkdirSync(STATEMENTS_DIR, { recursive: true });
mkdirSync(EXPECTED_DIR, { recursive: true });

const idr = (n: number) => n.toLocaleString("id-ID");
const idr2 = (n: number) => `${idr(n)},00`;
const [year, month] = MONTH.split("-") as [string, string];
const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const GREY = "#666666";

function open(file: string, title: string): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: title } });
  doc.pipe(createWriteStream(join(STATEMENTS_DIR, file)));
  return doc;
}

function footer(doc: PDFKit.PDFDocument, text: string) {
  doc
    .fontSize(7.5)
    .fillColor(GREY)
    .text(`${text} Dokumen contoh untuk pengujian: semua nama dan angka fiktif.`, 40, 772, {
      width: 515,
    });
}

function expectedTransactions(rows: BankRow[]) {
  return rows.map((r) => ({
    date: r.date,
    amount: r.amount,
    direction: r.direction,
    counterparty: r.counterparty || undefined,
    cls: r.cls,
  }));
}

// ---- bank e-statement ----

function makeBank() {
  const doc = open("sample_bank_sep_2026.pdf", `${BANK.name} e-Statement`);
  doc.rect(0, 0, doc.page.width, 56).fill("#0b4f9c");
  doc.fillColor("white").font("Helvetica-Bold").fontSize(18).text(BANK.name, 40, 18);
  doc
    .fontSize(10)
    .font("Helvetica")
    .text("e-Statement Rekening", 400, 24, { width: 155, align: "right" });

  doc.fillColor("black").font("Helvetica-Bold").fontSize(11).text(HOLDER.toUpperCase(), 40, 76);
  doc.font("Helvetica").fontSize(9).fillColor(GREY);
  doc.text(`${BANK.product}  No. Rekening ${BANK.accountNumber}`, 40, 92);
  doc.text(
    `Periode: 01/${month}/${year} - 30/${month}/${year}    Mata uang: IDR    KCP Serpong`,
    40,
    105,
  );
  doc.text(`Saldo awal: ${idr2(BANK.openingBalance)}`, 40, 118);

  const cols = { date: 40, desc: 90, branch: 352, amount: 390, balance: 480 };
  let y = 142;
  doc.fillColor("black").font("Helvetica-Bold").fontSize(8.5);
  doc.text("TANGGAL", cols.date, y);
  doc.text("KETERANGAN", cols.desc, y);
  doc.text("CBG", cols.branch, y);
  doc.text("MUTASI", cols.amount, y, { width: 80, align: "right" });
  doc.text("SALDO", cols.balance, y, { width: 75, align: "right" });
  y += 14;
  doc.moveTo(40, y).lineTo(555, y).stroke("#cccccc");
  y += 6;

  let balance = BANK.openingBalance;
  let credits = 0;
  let debits = 0;
  doc.font("Helvetica").fontSize(8.5);
  for (const r of BANK.rows) {
    balance += r.direction === "in" ? r.amount : -r.amount;
    if (r.direction === "in") credits += r.amount;
    else debits += r.amount;
    doc.fillColor("black");
    doc.text(ddmm(r.date), cols.date, y);
    doc.text(r.description, cols.desc, y, { width: 258 });
    doc.text("0000", cols.branch, y);
    doc.text(`${idr2(r.amount)} ${r.direction === "in" ? "CR" : "DB"}`, cols.amount, y, {
      width: 80,
      align: "right",
    });
    doc.text(idr2(balance), cols.balance, y, { width: 75, align: "right" });
    y += r.description.length > 52 ? 22 : 15;
  }
  y += 6;
  doc.moveTo(40, y).lineTo(555, y).stroke("#cccccc");
  y += 10;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("black");
  doc.text(`Mutasi CR: ${idr2(credits)}`, 40, y);
  doc.text(`Mutasi DB: ${idr2(debits)}`, 220, y);
  doc.text(`Saldo akhir: ${idr2(balance)}`, 400, y, { width: 155, align: "right" });
  footer(doc, `${BANK.name} terdaftar dan diawasi oleh OJK serta peserta penjaminan LPS.`);
  doc.end();

  writeFileSync(
    join(EXPECTED_DIR, "sample_bank_sep_2026.json"),
    `${JSON.stringify(
      {
        kind: "bank",
        month: MONTH,
        transactions: expectedTransactions(BANK.rows),
        loans: [],
        holdings: [],
      },
      null,
      2,
    )}\n`,
  );
  return balance;
}

// ---- e-wallet history ----

function makeEwallet() {
  const doc = open("sample_ewallet_sep_2026.pdf", `${EWALLET.name} Riwayat Transaksi`);
  doc.rect(0, 0, doc.page.width, 56).fill("#00a884");
  doc.fillColor("white").font("Helvetica-Bold").fontSize(18).text(EWALLET.name, 40, 18);
  doc
    .fontSize(10)
    .font("Helvetica")
    .text("Riwayat Transaksi", 400, 24, { width: 155, align: "right" });

  doc.fillColor("black").font("Helvetica-Bold").fontSize(11).text(HOLDER, 40, 76);
  doc.font("Helvetica").fontSize(9).fillColor(GREY);
  doc.text(`No. ${EWALLET.name}: ${EWALLET.phone}`, 40, 92);
  doc.text(`Periode: 1 - 30 September ${year}`, 40, 105);
  const inTotal = EWALLET.rows
    .filter((r) => r.direction === "in")
    .reduce((n, r) => n + r.amount, 0);
  const outTotal = EWALLET.rows
    .filter((r) => r.direction === "out")
    .reduce((n, r) => n + r.amount, 0);
  doc.text(`Total masuk: Rp${idr(inTotal)}    Total keluar: Rp${idr(outTotal)}`, 40, 118);

  const cols = { date: 40, desc: 120, method: 380, amount: 470 };
  let y = 142;
  doc.fillColor("black").font("Helvetica-Bold").fontSize(9);
  doc.text("Tanggal", cols.date, y);
  doc.text("Transaksi", cols.desc, y);
  doc.text("Metode", cols.method, y);
  doc.text("Jumlah", cols.amount, y, { width: 85, align: "right" });
  y += 14;
  doc.moveTo(40, y).lineTo(555, y).stroke("#cccccc");
  y += 8;

  let balance = EWALLET.openingBalance;
  doc.font("Helvetica").fontSize(9);
  const times = ["08:12", "12:40", "18:05", "09:31", "20:15", "13:22", "07:58", "19:44", "11:09"];
  for (const [i, r] of EWALLET.rows.entries()) {
    balance += r.direction === "in" ? r.amount : -r.amount;
    doc.fillColor("black").text(`${r.date.slice(8, 10)}/${month}/${year}`, cols.date, y);
    doc.fillColor(GREY).text(times[i % times.length] ?? "", cols.date, y + 11);
    doc.fillColor("black").text(r.description, cols.desc, y, { width: 250 });
    doc
      .fillColor(GREY)
      .text(`ID ${year}${month}${r.date.slice(8, 10)}-SP${(i + 1) * 7313}`, cols.desc, y + 11);
    doc
      .fillColor("black")
      .text(r.direction === "in" ? "Transfer bank" : "Saldo SakuPay", cols.method, y);
    doc
      .fillColor(r.direction === "in" ? "#0a7d3b" : "black")
      .text(`${r.direction === "in" ? "+" : "-"}Rp${idr(r.amount)}`, cols.amount, y, {
        width: 85,
        align: "right",
      });
    y += 30;
  }
  doc
    .fillColor(GREY)
    .fontSize(9)
    .text(`Saldo akhir: Rp${idr(balance)}`, 40, y + 6);
  footer(doc, `${EWALLET.name} berizin dan diawasi oleh Bank Indonesia.`);
  doc.end();

  writeFileSync(
    join(EXPECTED_DIR, "sample_ewallet_sep_2026.json"),
    `${JSON.stringify(
      {
        kind: "ewallet",
        month: MONTH,
        transactions: expectedTransactions(EWALLET.rows),
        loans: [],
        holdings: [],
      },
      null,
      2,
    )}\n`,
  );
}

// ---- investment portfolio ----

function makePortfolio() {
  const doc = open("sample_investment_sep_2026.pdf", `${PORTFOLIO.name} Portofolio`);
  doc.rect(0, 0, doc.page.width, 56).fill("#2e7d32");
  doc.fillColor("white").font("Helvetica-Bold").fontSize(18).text(PORTFOLIO.name, 40, 18);
  doc
    .fontSize(10)
    .font("Helvetica")
    .text("Ringkasan Portofolio", 400, 24, { width: 155, align: "right" });

  doc.fillColor("black").font("Helvetica-Bold").fontSize(11).text(HOLDER, 40, 76);
  doc.font("Helvetica").fontSize(9).fillColor(GREY);
  doc.text(`ID Nasabah: ${PORTFOLIO.clientId}    Per tanggal: ${PORTFOLIO.asOf}`, 40, 92);

  const total = sumHoldings();
  const gain = PORTFOLIO.holdings.reduce((n, h) => n + h.gain, 0);
  doc.roundedRect(40, 112, 515, 60, 6).stroke("#dddddd");
  doc.fillColor(GREY).fontSize(9).text("Total Portofolio", 56, 124);
  doc
    .fillColor("black")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(`Rp${idr(total)}`, 56, 138);
  doc.fillColor(GREY).font("Helvetica").fontSize(9).text("Keuntungan belum terealisasi", 320, 124);
  doc
    .fillColor(gain >= 0 ? "#0a7d3b" : "#c62828")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(`${gain >= 0 ? "+" : "-"}Rp${idr(Math.abs(gain))}`, 320, 138);

  const cols = { name: 40, type: 230, units: 340, value: 420, gain: 490 };
  let y = 196;
  doc.fillColor("black").font("Helvetica-Bold").fontSize(9);
  doc.text("Produk", cols.name, y);
  doc.text("Jenis", cols.type, y);
  doc.text("Kepemilikan", cols.units, y);
  doc.text("Nilai (Rp)", cols.value, y, { width: 65, align: "right" });
  doc.text("Untung/Rugi", cols.gain, y, { width: 65, align: "right" });
  y += 14;
  doc.moveTo(40, y).lineTo(555, y).stroke("#cccccc");
  y += 8;
  doc.font("Helvetica").fontSize(9);
  for (const h of PORTFOLIO.holdings) {
    doc.fillColor("black").font("Helvetica-Bold").text(h.instrument, cols.name, y, { width: 185 });
    doc.font("Helvetica").text(h.typeLabel, cols.type, y, { width: 105 });
    doc.text(h.units, cols.units, y, { width: 78 });
    doc.text(idr(h.value), cols.value, y, { width: 65, align: "right" });
    doc
      .fillColor(h.gain >= 0 ? "#0a7d3b" : "#c62828")
      .text(`${h.gain >= 0 ? "+" : "-"}${idr(Math.abs(h.gain))}`, cols.gain, y, {
        width: 65,
        align: "right",
      });
    if (h.lockedUntil) {
      doc
        .fillColor(GREY)
        .fontSize(8)
        .text(`Jatuh tempo ${h.lockedUntil}`, cols.name, y + 12);
      doc.fontSize(9);
    }
    y += h.lockedUntil ? 30 : 22;
  }
  doc.moveTo(40, y).lineTo(555, y).stroke("#cccccc");
  doc
    .fillColor("black")
    .font("Helvetica-Bold")
    .text("Total", cols.name, y + 8);
  doc.text(idr(total), cols.value, y + 8, { width: 65, align: "right" });
  footer(doc, `${PORTFOLIO.name} adalah APERD berizin OJK. Nilai dapat berubah setiap hari bursa.`);
  doc.end();

  writeFileSync(
    join(EXPECTED_DIR, "sample_investment_sep_2026.json"),
    `${JSON.stringify(
      {
        kind: "investment",
        month: MONTH,
        transactions: [],
        loans: [],
        holdings: PORTFOLIO.holdings.map((h) => ({
          instrument: h.instrument,
          aliases: h.aliases,
          currentValue: h.value,
          volatile: h.volatile,
          liquidityClass: h.liquidityClass,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

const closing = makeBank();
makeEwallet();
makePortfolio();
console.log(
  `wrote sample_bank_sep_2026 (${BANK.rows.length} rows, closing ${idr(closing)}), sample_ewallet_sep_2026 (${EWALLET.rows.length} rows), sample_investment_sep_2026 (${PORTFOLIO.holdings.length} holdings) and their expected JSON`,
);
