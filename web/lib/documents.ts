import type { SourceKind } from "@adidi/shared";
import { monthKeyOfDate, previousMonthKey } from "@adidi/shared";

// The documents step (docs/screens.md, "2"): which files are accepted, which month they
// belong to, and when Submit is allowed. Pure; unit-tested.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type AcceptedType = (typeof ACCEPTED_TYPES)[number];
export const ACCEPT_ATTRIBUTE = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

/** The three upload cards and the source kinds each one holds. */
export type CardId = "bank" | "loans" | "investments";

export interface CardSpec {
  id: CardId;
  title: string;
  subtitle: string;
  hint: string;
  kinds: { value: SourceKind; label: string }[];
  /** Spans the full width in the grid (the investments card in the design). */
  wide?: boolean;
}

export const CARDS: CardSpec[] = [
  {
    id: "bank",
    title: "Bank and e-wallet statements",
    subtitle: "BCA, Mandiri, Jago, GoPay, OVO · PDF or screenshot",
    hint: "Another account? Add it here",
    kinds: [
      { value: "bank", label: "Bank" },
      { value: "ewallet", label: "E-wallet" },
    ],
  },
  {
    id: "loans",
    title: "Pinjol and PayLater statements",
    subtitle: "Kredivo, SPayLater, GoPayLater, Akulaku · screenshot is fine",
    hint: "This is the input most apps skip. It matters most for loan approval.",
    kinds: [
      { value: "paylater", label: "PayLater" },
      { value: "pinjol", label: "Pinjol" },
    ],
  },
  {
    id: "investments",
    title: "Investments and savings",
    subtitle: "Bibit, Ajaib, Stockbit, deposito, gold · portfolio screenshot",
    hint: "Needed to check whether your savings fit the goal's timeline",
    kinds: [{ value: "investment", label: "Investment" }],
    wide: true,
  },
];

export type UploadStatus = "queued" | "uploading" | "uploaded" | "failed" | "removing";

/** One file on the page, from the moment it is picked until Submit. */
export interface UploadItem {
  localId: string;
  card: CardId;
  /** The monthly check-in's row: last month's document id the file replaces, or "new". */
  slot?: string;
  sourceKind: SourceKind;
  name: string;
  type: AcceptedType;
  size: number;
  status: UploadStatus;
  /** 0 to 100 while uploading. */
  progress: number;
  /** The `documents` record id once the api created it. */
  docId?: string;
  error?: string;
}

/** Why a picked file is refused, or null when it is accepted. */
export function rejectReason(file: { name: string; type: string; size: number }): string | null {
  const type = normalizedType(file);
  if (!type) return "Only PDF, PNG and JPG files are accepted.";
  if (file.size > MAX_UPLOAD_BYTES) return "Files must be 10 MB or smaller.";
  if (file.size === 0) return "This file is empty.";
  return null;
}

/** The MIME type the api expects; falls back to the extension for files the browser leaves untyped. */
export function normalizedType(file: { name: string; type: string }): AcceptedType | null {
  if ((ACCEPTED_TYPES as readonly string[]).includes(file.type)) return file.type as AcceptedType;
  if (file.type === "image/jpg") return "image/jpeg";
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return null;
}

/** "PDF · 412 KB" */
export function describeFile(item: Pick<UploadItem, "type" | "size">): string {
  return `${typeLabel(item.type)} · ${formatSize(item.size)}`;
}

export function typeLabel(type: AcceptedType): string {
  return type === "application/pdf" ? "PDF" : type === "image/png" ? "PNG" : "JPG";
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** The card a source kind belongs to. */
export function cardOf(kind: SourceKind): CardId {
  if (kind === "bank" || kind === "ewallet") return "bank";
  if (kind === "paylater" || kind === "pinjol") return "loans";
  return "investments";
}

/** Files that count: uploaded and not being removed. */
export function readyItems(items: readonly UploadItem[]): UploadItem[] {
  return items.filter((i) => i.status === "uploaded");
}

/** Submit needs at least one bank or e-wallet statement uploaded and nothing still in flight. */
export function canSubmit(items: readonly UploadItem[]): boolean {
  const inFlight = items.some((i) => i.status === "uploading" || i.status === "removing");
  return !inFlight && readyItems(items).some((i) => i.card === "bank");
}

/** The footer line: "4 files added · ready to submit". */
export function footerLine(items: readonly UploadItem[]): string {
  const ready = readyItems(items).length;
  const uploading = items.filter((i) => i.status === "uploading").length;
  if (uploading > 0) return `${ready} of ${ready + uploading} files uploaded`;
  if (ready === 0) return "No files yet";
  if (!canSubmit(items))
    return `${ready} ${ready === 1 ? "file" : "files"} added · add a bank or e-wallet statement to submit`;
  return `${ready} ${ready === 1 ? "file" : "files"} added · ready to submit`;
}

/** Statements are for a finished month: last month by default, with the two before it. */
export function defaultMonth(now: Date = new Date()): string {
  return previousMonthKey(monthKeyOfDate(now));
}

export function monthOptions(now: Date = new Date()): string[] {
  const first = defaultMonth(now);
  const second = previousMonthKey(first);
  return [first, second, previousMonthKey(second)];
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "September 2026" for "2026-09". */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${year}`;
}
