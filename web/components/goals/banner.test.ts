import { describe, expect, it } from "vitest";
import { bannerModel } from "./banner";

const OCT_31 = new Date("2026-10-31T12:00:00Z");
const NOV_1 = new Date("2026-11-01T12:00:00Z");

describe("bannerModel", () => {
  it("stays hidden on the last day of the month", () => {
    expect(bannerModel(OCT_31, ["2026-09"], 2)).toBeNull();
  });

  it("asks for October from 1 November until October is submitted", () => {
    expect(bannerModel(NOV_1, ["2026-09"], 2)).toEqual({
      month: "2026-10",
      title: "October is over: add its statements.",
      body: "Upload once and both active goals update, with what moved since September.",
      cta: "Upload October",
      href: "/documents/",
    });
  });

  it("disappears once October is submitted", () => {
    expect(bannerModel(NOV_1, ["2026-09", "2026-10"], 2)).toBeNull();
  });

  it("is never shown without an active goal", () => {
    expect(bannerModel(NOV_1, ["2026-09"], 0)).toBeNull();
    expect(bannerModel(NOV_1, [], 0)).toBeNull();
  });

  it("words the goal count and drops the comparison without last month", () => {
    expect(bannerModel(NOV_1, [], 1)?.body).toBe("Upload once and your active goal updates.");
    expect(bannerModel(NOV_1, ["2026-09"], 3)?.body).toBe(
      "Upload once and all 3 active goals update, with what moved since September.",
    );
  });

  it("crosses the year", () => {
    expect(bannerModel(new Date("2027-01-02T12:00:00Z"), ["2026-11"], 1)?.title).toBe(
      "December is over: add its statements.",
    );
  });
});
