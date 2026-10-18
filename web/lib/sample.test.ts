import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CARDS, initialKind, rejectReason } from "./documents";
import { SAMPLE_MONTH, SAMPLE_STATEMENTS, sampleUrl } from "./sample";

// The "Use sample statements" button (docs/screens.md, "2 · Documents"): the copies the browser
// fetches stay identical to the committed fixtures, and each file lands in the right card.

const repo = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

describe("sample statements", () => {
  it("serves byte-identical copies of fixtures/statements", () => {
    for (const { file } of SAMPLE_STATEMENTS) {
      const served = readFileSync(repo(`web/public/samples/${file}`));
      const fixture = readFileSync(repo(`fixtures/statements/${file}`));
      expect(served.equals(fixture), `${file} differs; copy it again`).toBe(true);
    }
  });

  it("puts each file in a card that holds its kind, and the kind matches its name", () => {
    for (const s of SAMPLE_STATEMENTS) {
      const card = CARDS.find((c) => c.id === s.card);
      expect(card?.kinds.map((k) => k.value)).toContain(s.sourceKind);
      expect(initialKind(s.card, s.file)).toBe(s.sourceKind);
    }
    expect(new Set(SAMPLE_STATEMENTS.map((s) => s.card)).size).toBe(3);
  });

  it("is fetched from its copy in web/public", () => {
    for (const { file } of SAMPLE_STATEMENTS) {
      const url = sampleUrl(file);
      expect(url).toBe(`/samples/${file}`);
      expect(readFileSync(repo(`web/public${url}`)).length).toBeGreaterThan(0);
    }
  });

  it("passes the manual upload checks", () => {
    for (const { file } of SAMPLE_STATEMENTS) {
      const size = readFileSync(repo(`web/public/samples/${file}`)).length;
      expect(rejectReason({ name: file, type: "application/pdf", size })).toBeNull();
      expect(file).toContain("sep_2026");
    }
    expect(SAMPLE_MONTH).toBe("2026-09");
  });
});
