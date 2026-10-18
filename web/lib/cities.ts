// The cities the house form offers (specs/10-ui-goal-creation.md). A fixed list instead of free
// text, because most judges do not know Indonesian place names. `value` is the string stored as
// HouseInputs.area and sent to the pricing search; `label` is what the dropdown shows; `aliases`
// are older free-text areas (drafts, the demo seed) that resume as this city. Add a city here.

export interface CityOption {
  value: string;
  label: string;
  aliases: string[];
}

export const HOUSE_CITIES: readonly CityOption[] = [
  { value: "Jakarta Selatan", label: "Jakarta Selatan", aliases: ["South Jakarta"] },
  {
    value: "Serpong, Tangerang Selatan",
    label: "Tangerang Selatan (Serpong)",
    aliases: ["Tangerang Selatan", "Serpong", "BSD", "South Tangerang"],
  },
  { value: "Depok", label: "Depok", aliases: [] },
  { value: "Bekasi", label: "Bekasi", aliases: [] },
  { value: "Bogor", label: "Bogor", aliases: [] },
];

/** The offered city a stored area stands for, or "" when it matches none (the user picks again). */
export function cityForArea(area: string): string {
  const key = area.trim().toLowerCase();
  if (!key) return "";
  const city = HOUSE_CITIES.find(
    (c) => c.value.toLowerCase() === key || c.aliases.some((a) => a.toLowerCase() === key),
  );
  return city?.value ?? "";
}

export function isHouseCity(area: string): boolean {
  return HOUSE_CITIES.some((c) => c.value === area);
}
