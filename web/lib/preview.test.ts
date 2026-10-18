import { describe, expect, it } from "vitest";
import { CARDS } from "./documents";
import { isObjectUrl, kindLabel, previewKind, previewSrc, previewSubtitle } from "./preview";

// The preview dialog of the documents step (docs/screens.md, "2 · Documents").

describe("previewKind", () => {
  it("shows PDFs in a frame and screenshots as an image", () => {
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("image/jpeg")).toBe("image");
  });
});

describe("previewSrc", () => {
  it("fits a PDF to the width, from a hosted sample or an object URL", () => {
    expect(previewSrc("/samples/sample_bank_sep_2026.pdf", "application/pdf")).toBe(
      "/samples/sample_bank_sep_2026.pdf#view=FitH",
    );
    expect(previewSrc("blob:http://localhost:3000/abc", "application/pdf")).toBe(
      "blob:http://localhost:3000/abc#view=FitH",
    );
  });

  it("keeps a PDF URL that already has a fragment, and leaves images alone", () => {
    expect(previewSrc("/a.pdf#page=2", "application/pdf")).toBe("/a.pdf#page=2");
    expect(previewSrc("blob:http://localhost:3000/abc", "image/png")).toBe(
      "blob:http://localhost:3000/abc",
    );
  });
});

describe("previewSubtitle", () => {
  it("names the kind as the card's select does, then the type and size", () => {
    expect(previewSubtitle({ sourceKind: "bank", type: "application/pdf", size: 3669 })).toBe(
      "Bank · PDF · 4 KB",
    );
    expect(previewSubtitle({ sourceKind: "ewallet", type: "image/png", size: 2_200_000 })).toBe(
      "E-wallet · PNG · 2.1 MB",
    );
  });

  it("has a label for every kind a card holds", () => {
    for (const card of CARDS) {
      for (const k of card.kinds) expect(kindLabel(k.value)).toBe(k.label);
    }
  });
});

describe("isObjectUrl", () => {
  it("releases object URLs only, never a hosted sample", () => {
    expect(isObjectUrl("blob:http://localhost:3000/abc")).toBe(true);
    expect(isObjectUrl("/samples/sample_bank_sep_2026.pdf")).toBe(false);
  });
});
