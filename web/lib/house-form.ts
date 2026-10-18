import type { Estimate, HouseInputs, PayPreference } from "@adidi/shared";
import { parseRupiahInput } from "@adidi/shared";
import { cityForArea, isHouseCity } from "./cities";

// The house form's state and the pure rules around it (specs/10-ui-goal-creation.md):
// what the inputs on screen map to, whether the stored estimate is stale, and whether the
// person may continue. Components stay thin; this file is unit-tested.

export type SizeMode = "size" | "budget";

/** Every field as the inputs hold it; money fields as typed text ("280.000.000"). */
export interface HouseFormValues {
  area: string;
  targetYear: number;
  propertyType: HouseInputs["propertyType"];
  sizeMode: SizeMode;
  landM2: string;
  buildingM2: string;
  budgetLow: string;
  budgetHigh: string;
  market: HouseInputs["market"];
  firstHome: boolean;
  payPreference: PayPreference;
  plannedDp: string;
  joint: NonNullable<HouseInputs["joint"]>;
}

export const TARGET_YEAR_SPAN = 10;

/** Target years offered: next year to ten years out. */
export function targetYears(now: Date = new Date()): number[] {
  const thisYear = now.getFullYear();
  return Array.from({ length: TARGET_YEAR_SPAN }, (_, i) => thisYear + 1 + i);
}

export function defaultHouseForm(now: Date = new Date()): HouseFormValues {
  return {
    area: "",
    targetYear: now.getFullYear() + 2,
    propertyType: "landed",
    sizeMode: "size",
    landM2: "",
    buildingM2: "",
    budgetLow: "",
    budgetHigh: "",
    market: "new",
    firstHome: true,
    payPreference: "loan",
    plannedDp: "",
    joint: "not_married",
  };
}

/** The form values for a stored draft, so a draft resumes with its own numbers. */
export function houseFormFromInputs(
  inputs: HouseInputs,
  payPreference: PayPreference,
  now: Date = new Date(),
): HouseFormValues {
  const base = defaultHouseForm(now);
  const budget = inputs.budgetRange;
  return {
    ...base,
    area: cityForArea(inputs.area),
    targetYear: inputs.targetYear,
    propertyType: inputs.propertyType,
    sizeMode: budget && !inputs.landM2 && !inputs.buildingM2 ? "budget" : "size",
    landM2: inputs.landM2 ? String(inputs.landM2) : "",
    buildingM2: inputs.buildingM2 ? String(inputs.buildingM2) : "",
    budgetLow: budget ? formatPlain(budget[0]) : "",
    budgetHigh: budget ? formatPlain(budget[1]) : "",
    market: inputs.market,
    firstHome: inputs.firstHome,
    payPreference,
    plannedDp: inputs.plannedDp ? formatPlain(inputs.plannedDp) : "",
    joint: inputs.joint ?? "not_married",
  };
}

function formatPlain(amount: number): string {
  return String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export type FormErrors = Partial<Record<keyof HouseFormValues, string>>;

/**
 * The HouseInputs the api receives for these values, or the field errors that stop it.
 * Optional fields are left out (not `undefined`) so the object is what the api stores as
 * `inputsUsed` and the stale check compares like with like.
 */
export function toHouseInputs(
  values: HouseFormValues,
): { ok: true; inputs: HouseInputs } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  const area = values.area.trim();
  if (!isHouseCity(area)) errors.area = "Choose a city.";

  const inputs: HouseInputs = {
    area,
    propertyType: values.propertyType,
    market: values.market,
    firstHome: values.firstHome,
    targetYear: values.targetYear,
  };

  if (values.sizeMode === "size") {
    const land = positiveNumber(values.landM2);
    const building = positiveNumber(values.buildingM2);
    if (values.landM2.trim() && land === null) errors.landM2 = "Enter a size in m².";
    if (values.buildingM2.trim() && building === null) errors.buildingM2 = "Enter a size in m².";
    if (land !== null) inputs.landM2 = land;
    if (building !== null) inputs.buildingM2 = building;
  } else {
    const low = parseRupiahInput(values.budgetLow);
    const high = parseRupiahInput(values.budgetHigh);
    if (low === null || low <= 0) errors.budgetLow = "Enter the lowest budget in rupiah.";
    if (high === null || high <= 0) errors.budgetHigh = "Enter the highest budget in rupiah.";
    else if (low !== null && low > high) errors.budgetHigh = "The high end is below the low end.";
    if (low !== null && high !== null && low > 0 && low <= high) inputs.budgetRange = [low, high];
  }

  if (values.plannedDp.trim()) {
    const dp = parseRupiahInput(values.plannedDp);
    if (dp === null || dp < 0) errors.plannedDp = "Enter an amount in rupiah.";
    else if (dp > 0) inputs.plannedDp = dp;
  }
  if (values.joint !== "not_married") inputs.joint = values.joint;

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, inputs };
}

function positiveNumber(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** True when the inputs on screen differ from the ones the estimate was calculated from. */
export function isEstimateStale(current: HouseInputs, estimate: Pick<Estimate, "inputsUsed">) {
  return !sameInputs(current as unknown as Record<string, unknown>, estimate.inputsUsed);
}

function sameInputs(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (x === undefined && y === undefined) continue;
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
      continue;
    }
    if (x !== y) return false;
  }
  return true;
}

/** The price the rest of the flow uses: the person's own number when typed, else the estimate. */
export function effectivePrice(estimate: Estimate | null, override: number | null): number | null {
  if (override !== null && override > 0) return override;
  return estimate?.targetToday ?? null;
}

/** Continue is enabled once an estimate exists or the person typed a price (docs/screens.md). */
export function canContinue(estimate: Estimate | null, override: number | null): boolean {
  return effectivePrice(estimate, override) !== null;
}

/** "landed, 70/90 m², new, Serpong, 2028": the inputs an estimate was calculated from. */
export function describeHouseInputs(inputs: Partial<HouseInputs>): string {
  const parts: string[] = [];
  if (inputs.propertyType) parts.push(inputs.propertyType === "landed" ? "landed" : "apartment");
  if (inputs.buildingM2 && inputs.landM2) parts.push(`${inputs.buildingM2}/${inputs.landM2} m²`);
  else if (inputs.buildingM2) parts.push(`${inputs.buildingM2} m² building`);
  else if (inputs.landM2) parts.push(`${inputs.landM2} m² land`);
  if (inputs.market) parts.push(inputs.market === "new" ? "new" : "secondary");
  if (inputs.area) parts.push(inputs.area);
  if (inputs.targetYear) parts.push(String(inputs.targetYear));
  return parts.join(", ");
}

/** "a new 70/90 landed house in Serpong" for the range line. */
export function describeHouseShort(inputs: Partial<HouseInputs>): string {
  const market = inputs.market === "secondary" ? "secondary" : "new";
  const size = inputs.buildingM2 && inputs.landM2 ? ` ${inputs.buildingM2}/${inputs.landM2}` : "";
  const kind = inputs.propertyType === "apartment" ? "apartment" : "landed house";
  const where = inputs.area ? ` in ${inputs.area}` : "";
  return `a ${market}${size} ${kind}${where}`;
}

/** "2 min ago", "just now", "3 h ago", "yesterday". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
