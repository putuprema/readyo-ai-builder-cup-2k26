import { writeFileSync } from "node:fs";
import {
  formatTable,
  overallRowAccuracy,
  pct,
  ROW_ACCURACY_TARGET,
  scoreFixture,
} from "../src/accuracy/compare.js";
import { extractDocument } from "../src/extraction/extract.js";
import { loadFixtures, readFixtureBytes, STATEMENTS_DIR } from "../src/fixtures.js";
import { createGeminiModel, modelIds } from "../src/gemini/client.js";
import { normalize } from "../src/normalization/index.js";

// Extraction accuracy over fixtures/ (specs/04-extraction.md task 6). Runs the real models:
// needs GEMINI_API_KEY (worker/.env) and the team's anonymised statements with expected JSON.
//
//   pnpm --filter worker accuracy            prints the table
//   pnpm --filter worker accuracy -- --out report.json   also writes the scores as JSON
//   pnpm --filter worker accuracy -- --verbose          prints the extracted rows and holdings
//
// Exit code 1 when any fixture fails a criterion, so it can gate a release.

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
  // --verbose prints the extracted rows as date | direction | amount | class, and holdings as
  // instrument | type | value. Never descriptions or account labels.
  const verbose = process.argv.includes("--verbose");

  const { fixtures, unmatched } = loadFixtures();
  for (const file of unmatched) {
    console.log(`skipping ${file}: no expected JSON in fixtures/expected/`);
  }
  if (fixtures.length === 0) {
    console.log(`No fixtures with expected JSON in ${STATEMENTS_DIR}. See fixtures/README.md.`);
    process.exit(2);
  }

  const model = createGeminiModel();
  console.log(`models: ${modelIds().pro} (extraction), ${modelIds().flash} (classification)`);
  console.log(`fixtures: ${fixtures.map((f) => f.name).join(", ")}\n`);

  const extractions = [];
  for (const fixture of fixtures) {
    const started = Date.now();
    try {
      const result = await extractDocument(
        {
          document: fixture.document,
          file: { bytes: readFixtureBytes(fixture), mimeType: fixture.mimeType },
        },
        model,
      );
      console.log(
        `${fixture.name}: ${result.transactions.length} transactions, ${result.loans.length} loans, ${result.holdings.length} holdings in ${Date.now() - started} ms` +
          (result.warnings.length ? ` (warnings: ${result.warnings.join(" | ")})` : ""),
      );
      extractions.push({ fixture, result });
    } catch (error) {
      console.log(`${fixture.name}: FAILED ${error instanceof Error ? error.message : error}`);
      extractions.push({
        fixture,
        result: { transactions: [], loans: [], holdings: [], warnings: [] },
      });
    }
  }

  // Normalize every transaction together, as the pipeline does, so cross-source transfers match.
  const normalized = await normalize(
    { transactions: extractions.flatMap((e) => e.result.transactions) },
    model,
    (m) => console.log(m),
  );
  const byFile = new Map<string, typeof normalized.transactions>();
  for (const t of normalized.transactions) {
    const list = byFile.get(t.sourceFileId) ?? [];
    list.push(t);
    byFile.set(t.sourceFileId, list);
  }

  const scores = extractions.map(({ fixture, result }) =>
    scoreFixture(fixture.name, fixture.expected, {
      transactions: byFile.get(fixture.document.id) ?? [],
      loans: result.loans,
      holdings: result.holdings,
    }),
  );

  if (verbose) {
    for (const { fixture, result } of extractions) {
      console.log(`\n${fixture.name}:`);
      for (const t of byFile.get(fixture.document.id) ?? []) {
        console.log(
          `  ${t.date} | ${t.direction} | ${t.amount} | ${t.cls ?? "-"} | ${t.category ?? "-"}`,
        );
      }
      for (const h of result.holdings) {
        console.log(
          `  ${h.instrument} | ${h.liquidityClass} | volatile=${h.volatile} | ${h.currency ? `${h.currency} ${h.nativeValue}` : `Rp ${h.currentValue}`}`,
        );
      }
      for (const l of result.loans) {
        console.log(
          `  ${l.lender} | ${l.type} | Rp ${l.outstandingPrincipal} | Rp ${l.monthlyInstallment}/mo | ${l.effectiveAnnualRate}`,
        );
      }
    }
  }

  console.log(`\n${formatTable(scores)}\n`);
  const overall = overallRowAccuracy(scores);
  console.log(
    `overall row accuracy (date, amount, direction): ${pct(overall)} (target ${pct(ROW_ACCURACY_TARGET)})`,
  );
  if (normalized.warnings.length) console.log(`warnings: ${normalized.warnings.join(" | ")}`);

  if (outPath) {
    writeFileSync(
      outPath,
      JSON.stringify({ models: modelIds(), overallRowAccuracy: overall, scores }, null, 2),
    );
    console.log(`wrote ${outPath}`);
  }
  process.exit(scores.every((s) => s.pass) ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
