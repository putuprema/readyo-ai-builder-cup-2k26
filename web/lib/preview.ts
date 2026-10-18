import type { SourceKind } from "@adidi/shared";
import { type AcceptedType, CARDS, describeFile, type UploadItem } from "./documents";

// Previewing a file on the documents step before Submit (docs/screens.md, "2 · Documents"). The
// file never leaves the browser for this: a picked file is shown from an object URL of the File
// in memory, a sample statement from its copy in web/public/samples. After Submit there is no
// preview, because the original is deleted once it is read. Pure; unit-tested.

/** How the dialog shows a file: PDFs in a frame, screenshots as an image. */
export function previewKind(type: AcceptedType): "pdf" | "image" {
  return type === "application/pdf" ? "pdf" : "image";
}

/** The frame's source: PDFs open fitted to the width, which matters on a phone. */
export function previewSrc(url: string, type: AcceptedType): string {
  if (previewKind(type) !== "pdf") return url;
  return url.includes("#") ? url : `${url}#view=FitH`;
}

/** The label of a source kind as the card's kind select shows it: "Bank", "PayLater". */
export function kindLabel(kind: SourceKind): string {
  for (const card of CARDS) {
    const match = card.kinds.find((k) => k.value === kind);
    if (match) return match.label;
  }
  return kind;
}

/** The line under the file name in the dialog header: "Bank · PDF · 4 KB". */
export function previewSubtitle(item: Pick<UploadItem, "sourceKind" | "type" | "size">): string {
  return `${kindLabel(item.sourceKind)} · ${describeFile(item)}`;
}

/** Object URLs hold the file in memory until released; a hosted sample's URL does not. */
export function isObjectUrl(url: string): boolean {
  return url.startsWith("blob:");
}
