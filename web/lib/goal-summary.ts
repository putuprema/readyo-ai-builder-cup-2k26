import type { CarInputs, Goal, HouseInputs, WeddingInputs } from "@adidi/shared";

/** One-line goal description used in eyebrows and cards ("House · Tangerang Selatan · 2029"). */
export function goalSummary(goal: Goal): string {
  switch (goal.type) {
    case "house": {
      const inputs = goal.inputs as HouseInputs;
      return `House · ${inputs.area} · ${inputs.targetYear}`;
    }
    case "car": {
      const inputs = goal.inputs as CarInputs;
      return `Car · ${inputs.modelOrSegment} · ${inputs.targetYear}`;
    }
    case "wedding": {
      const inputs = goal.inputs as WeddingInputs;
      return `Wedding · ${inputs.city} · ${inputs.targetMonth}`;
    }
  }
}
