import type { Goal } from "@adidi/shared";
import { FakeGoalStore } from "../pricing/fakes.js";
import type { GoalWriteStore } from "./ports.js";

// In-memory goal store for the goal endpoint tests, on top of the pricing fake.

export class FakeGoalWriteStore extends FakeGoalStore implements GoalWriteStore {
  readonly deleted: string[] = []; // `${uid}/${goalId}`

  async createGoal(uid: string, goal: Goal): Promise<void> {
    if (this.goals.has(`${uid}/${goal.id}`)) throw new Error(`goal ${goal.id} exists`);
    this.goals.set(`${uid}/${goal.id}`, goal);
  }

  async replaceGoal(uid: string, goal: Goal): Promise<void> {
    if (!this.goals.has(`${uid}/${goal.id}`)) throw new Error(`no goal ${goal.id}`);
    this.goals.set(`${uid}/${goal.id}`, goal);
  }

  async deleteGoal(uid: string, goalId: string): Promise<void> {
    this.goals.delete(`${uid}/${goalId}`);
    this.deleted.push(`${uid}/${goalId}`);
  }
}
