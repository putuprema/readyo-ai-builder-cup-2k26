import { describe, expect, it } from "vitest";
import { goalIdFromPath } from "./goal-id";

describe("goalIdFromPath", () => {
  it("reads the id from /goals/{id}/progress and /goals/{id}/result", () => {
    expect(goalIdFromPath("/goals/house-tangsel/progress/")).toBe("house-tangsel");
    expect(goalIdFromPath("/goals/house-tangsel/result")).toBe("house-tangsel");
  });
  it("returns null for the export placeholder and for other paths", () => {
    expect(goalIdFromPath("/goals/_/result/")).toBeNull();
    expect(goalIdFromPath("/goals/new/")).toBe("new");
    expect(goalIdFromPath("/")).toBeNull();
  });
});
