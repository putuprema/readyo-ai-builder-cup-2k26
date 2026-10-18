import type { HouseInputs, PayPreference, Profile } from "@adidi/shared";

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
