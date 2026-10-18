import { describe, expect, it } from "vitest";
import { hasUndefined, plainJson } from "./plain.js";

describe("plainJson", () => {
  it("drops undefined properties at every depth and keeps nulls", () => {
    const value = { a: 1, b: undefined, c: { d: undefined, e: null, f: [{ g: undefined, h: 2 }] } };
    const plain = plainJson(value);
    expect(plain).toEqual({ a: 1, c: { e: null, f: [{ h: 2 }] } });
    expect(hasUndefined(value)).toBe(true);
    expect(hasUndefined(plain)).toBe(false);
  });

  it("returns a copy", () => {
    const value = { list: [1, 2] };
    const plain = plainJson(value);
    expect(plain).not.toBe(value);
    expect(plain.list).not.toBe(value.list);
  });
});
