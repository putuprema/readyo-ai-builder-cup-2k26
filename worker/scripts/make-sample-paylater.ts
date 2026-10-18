import { createWriteStream } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { STATEMENTS_DIR } from "../src/fixtures.js";

// Synthetic PayLater bill for the extraction fixtures (specs/04-extraction.md): the team has no
// real one to anonymise. Every name and number here is invented; the figures are chosen so the
// expected JSON can be checked by hand:
//
//   item A: principal Rp 6.000.000, 6 instalments, this is the 3rd  -> principal left Rp 4.000.000,
//           instalment Rp 1.000.000 + 2,95% x 6.000.000 = Rp 1.177.000, 4 instalments left
//   item B: principal Rp 3.000.000, 3 instalments, this is the 1st  -> principal left Rp 3.000.000,
//           instalment Rp 1.000.000 + 2,95% x 3.000.000 = Rp 1.088.500, 3 instalments left
//   total due this month Rp 2.265.500, principal outstanding Rp 7.000.000, 4 months left,
//   fee 2,95% per month -> 35,4% a year.
//
// The virtual account number is fake and 16 digits long on purpose: extraction must mask it.
//
//   pnpm --filter worker fixtures:paylater

const out = join(STATEMENTS_DIR, "sample_paylater_sep_2026.pdf");
const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Tagihan SPayLater" } });
doc.pipe(createWriteStream(out));

const orange = "#ee4d2d";
const grey = "#666666";
const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

doc.rect(0, 0, doc.page.width, 70).fill(orange);
doc.fillColor("white").font("Helvetica-Bold").fontSize(22).text("ShopeePay Later", 48, 24);
doc.fontSize(11).font("Helvetica").text("Tagihan Bulanan", 420, 30, { align: "right", width: 127 });

doc.moveDown(3);
doc.fillColor("black").font("Helvetica-Bold").fontSize(14).text("Tagihan September 2026", 48, 96);
doc.font("Helvetica").fontSize(10).fillColor(grey);
doc.text("Nama: Sari Wulandari", 48, 118);
doc.text("No. Virtual Account: 8800 1234 5678 9012", 48, 132);
doc.text("Periode tagihan: 1 - 30 September 2026", 48, 146);
doc.text("Jatuh tempo: 5 Oktober 2026", 48, 160);
doc.text("Limit tersedia: Rp3.000.000 dari Rp10.000.000", 48, 174);

// Summary box.
doc.roundedRect(48, 196, 499, 70, 6).stroke("#dddddd");
doc.fillColor(grey).fontSize(10).text("Total tagihan bulan ini", 64, 210);
doc.fillColor(orange).font("Helvetica-Bold").fontSize(20).text(rp(2_265_500), 64, 226);
doc.fillColor(grey).font("Helvetica").fontSize(10).text("Sisa pokok pinjaman", 300, 210);
doc.fillColor("black").font("Helvetica-Bold").fontSize(14).text(rp(7_000_000), 300, 226);
doc
  .fillColor(grey)
  .font("Helvetica")
  .fontSize(9)
  .text("Biaya penanganan 2,95% per bulan dari pokok", 300, 246);

// Instalment table.
const top = 290;
const cols = [48, 200, 290, 370, 460];
doc.fillColor("black").font("Helvetica-Bold").fontSize(10);
const headers = ["Transaksi", "Cicilan ke", "Pokok/bulan", "Biaya", "Tagihan"];
for (const [i, h] of headers.entries()) doc.text(h, cols[i] ?? 0, top);
doc
  .moveTo(48, top + 16)
  .lineTo(547, top + 16)
  .stroke("#dddddd");

const rows = [
  ["Samsung Galaxy A56 8/256", "3 dari 6", rp(1_000_000), rp(177_000), rp(1_177_000)],
  ["Sepeda Listrik Uwinfly T3", "1 dari 3", rp(1_000_000), rp(88_500), rp(1_088_500)],
];
doc.font("Helvetica").fontSize(10);
for (const [r, row] of rows.entries()) {
  const y = top + 26 + r * 22;
  for (const [i, cell] of row.entries()) doc.text(cell, cols[i] ?? 0, y);
}
const totalY = top + 26 + rows.length * 22 + 6;
doc.moveTo(48, totalY).lineTo(547, totalY).stroke("#dddddd");
doc.font("Helvetica-Bold").text("Total tagihan", 48, totalY + 8);
doc.text(rp(2_265_500), cols[4] ?? 0, totalY + 8);

// Outstanding detail.
const detailY = totalY + 48;
doc
  .font("Helvetica-Bold")
  .fontSize(11)
  .fillColor("black")
  .text("Rincian sisa pinjaman", 48, detailY);
doc.font("Helvetica").fontSize(10).fillColor(grey);
doc.text("Samsung Galaxy A56 8/256: sisa pokok Rp4.000.000, 4 cicilan tersisa", 48, detailY + 18);
doc.text("Sepeda Listrik Uwinfly T3: sisa pokok Rp3.000.000, 3 cicilan tersisa", 48, detailY + 32);
doc.fillColor("black").text("Total sisa pokok pinjaman: Rp7.000.000", 48, detailY + 52);
doc.text("Total sisa tagihan termasuk biaya: Rp7.973.500", 48, detailY + 66);
doc.fillColor(grey).text("Denda keterlambatan: Rp0", 48, detailY + 80);

doc
  .fontSize(8)
  .fillColor(grey)
  .text(
    "Dokumen contoh untuk pengujian. Semua nama dan angka fiktif. Bayar sebelum jatuh tempo untuk menghindari denda 5% dari tagihan.",
    48,
    720,
    { width: 499 },
  );

doc.end();
console.log(`wrote ${out}`);
