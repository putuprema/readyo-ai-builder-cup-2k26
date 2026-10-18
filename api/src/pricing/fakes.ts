import type { Estimate, Goal, Override, RuleValue } from "@adidi/shared";
import defaultRules from "@adidi/shared/rules/defaults.json" with { type: "json" };
import type { JsonModel, JsonRequest, JsonResult } from "../gemini/client.js";
import type { GoalStore } from "./ports.js";

// In-memory versions of the model and the goal store for the pricing tests. The model answers
// with a canned JSON (or throws) and records the requests it received; the store holds goals
// per user and records every estimate written.

export class FakeModel implements JsonModel {
  readonly requests: JsonRequest[] = [];

  constructor(private readonly answer: () => JsonResult | Promise<JsonResult>) {}

  static returning(
    json: unknown,
    grounding: JsonResult["grounding"] = { queries: [], sources: [] },
  ) {
    return new FakeModel(() => ({ json, grounding }));
  }

  static throwing(error: unknown) {
    return new FakeModel(() => {
      throw error;
    });
  }

  async generateJson(request: JsonRequest): Promise<JsonResult> {
    this.requests.push(request);
    return this.answer();
  }
}

export class FakeGoalStore implements GoalStore {
  readonly goals = new Map<string, Goal>(); // key: `${uid}/${goalId}`
  readonly writes: { uid: string; goalId: string; estimate: Estimate }[] = [];
  rules: RuleValue[];
  overrides: Override[] = [];

  constructor(rules: RuleValue[] = defaultRules as RuleValue[]) {
    this.rules = rules;
  }

  addGoal(uid: string, goal: Goal): this {
    this.goals.set(`${uid}/${goal.id}`, goal);
    return this;
  }

  async getGoal(uid: string, goalId: string): Promise<Goal | null> {
    return this.goals.get(`${uid}/${goalId}`) ?? null;
  }

  async setEstimate(uid: string, goalId: string, estimate: Estimate, updatedAt: string) {
    const goal = this.goals.get(`${uid}/${goalId}`);
    if (!goal) throw new Error(`no goal ${goalId}`);
    this.goals.set(`${uid}/${goalId}`, { ...goal, estimate, updatedAt });
    this.writes.push({ uid, goalId, estimate });
  }

  async listRules(): Promise<RuleValue[]> {
    return this.rules;
  }

  async listOverrides(_uid: string): Promise<Override[]> {
    return this.overrides;
  }
}
