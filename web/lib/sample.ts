import type { HouseInputs, PayPreference, Profile, SourceKind } from "@adidi/shared";
import type { CardId } from "./documents";

// The sample scenario a new goal starts from, so someone trying the prototype only presses
// Calculate estimate and Continue. It matches the household in the sample statements
// (fixtures/statements, worker/scripts/sample-data.ts): a salaried employee in Serpong taking
// home Rp 15.000.000 a month, renting, saving for a first home with a KPR. Every value stays
// editable; a saved draft never gets these. Change the scenario here.

export const SAMPLE_HOUSE: { inputs: HouseInputs; payPreference: PayPreference } = {
  inputs: {
    area: "Serpong, Tangerang Selatan",
    propertyType: "landed",
    landM2: 90,
    buildingM2: 70,
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
