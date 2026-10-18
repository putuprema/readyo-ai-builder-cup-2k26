import type { HouseInputs, PayPreference, Profile, SourceKind } from "@adidi/shared";
import type { CardId } from "./documents";

// The sample scenario a new goal starts from, so someone trying the prototype only presses
// Calculate estimate and Continue. It matches the household in the sample statements
// (fixtures/statements, worker/scripts/sample-data.ts): a salaried employee in Serpong taking
// home Rp 15.000.000 a month, renting, saving for a first home with a KPR. The house is a new
// 36/72 starter home in Bekasi (priced about Rp 470 m, range Rp 365–610 m, on 2026-10-18), which
// that income can reach: the result shows the rules, a plan and a ready month. A 70/90 house in
// Serpong (about Rp 1.4 bn) was out of reach for 30 years. Every value stays editable; a saved
// draft never gets these. Change the scenario here.

export const SAMPLE_HOUSE: { inputs: HouseInputs; payPreference: PayPreference } = {
  inputs: {
    area: "Bekasi",
    propertyType: "landed",
    landM2: 72,
    buildingM2: 36,
    market: "new",
    firstHome: true,
    targetYear: 2028,
  },
  payPreference: "loan",
};

export const SAMPLE_PROFILE: Profile = {
  age: 29,
  employment: "permanent",
  netMonthlyIncome: 15_000_000,
  maritalStatus: "single",
  dependents: 0,
  city: "Tangerang Selatan",
};

export const SAMPLE_NOTE = "Filled in with a sample scenario. Change anything to match your own.";
export const SAMPLE_PROFILE_NOTE =
  "Filled in with a sample profile that fits the sample statements. Change anything to match your own.";

/** The month the sample statements cover. */
export const SAMPLE_MONTH = "2026-09";

/**
 * The four synthetic statements (fictional institutions, one household, September 2026) and
 * the upload card and kind each goes to. The files are committed copies of
 * fixtures/statements/sample_*.pdf in web/public/samples/; a test keeps them identical.
 */
export const SAMPLE_STATEMENTS: readonly { file: string; card: CardId; sourceKind: SourceKind }[] =
  [
    { file: "sample_bank_sep_2026.pdf", card: "bank", sourceKind: "bank" },
    { file: "sample_ewallet_sep_2026.pdf", card: "bank", sourceKind: "ewallet" },
    { file: "sample_paylater_sep_2026.pdf", card: "loans", sourceKind: "paylater" },
    { file: "sample_investment_sep_2026.pdf", card: "investments", sourceKind: "investment" },
  ];

export const SAMPLE_STATEMENTS_URL = "/samples/";

/** Fetches the sample PDFs and wraps each as a File with its own name, as a file picker would. */
export async function loadSampleStatements(): Promise<
  { file: File; card: CardId; sourceKind: SourceKind }[]
> {
  return Promise.all(
    SAMPLE_STATEMENTS.map(async (sample) => {
      const res = await fetch(`${SAMPLE_STATEMENTS_URL}${sample.file}`);
      if (!res.ok) throw new Error(`Could not load ${sample.file} (${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], sample.file, { type: "application/pdf" });
      return { file, card: sample.card, sourceKind: sample.sourceKind };
    }),
  );
}
