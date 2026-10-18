"use client";

import type { SourceKind } from "@adidi/shared";
import { type DragEvent, useId, useState } from "react";
import { ACCEPT_ATTRIBUTE, type CardSpec, describeFile, type UploadItem } from "@/lib/documents";

// One upload card of the documents step: title, file rows (name, type, size, progress,
// remove), and a drop zone that is a real <label> around the file input.

export function UploadCard({
  spec,
  items,
  rejected,
  onFiles,
  onRemove,
  onKindChange,
  disabled,
}: {
  spec: CardSpec;
  items: UploadItem[];
  /** Files refused on pick, shown under the drop zone until the next pick. */
  rejected: { name: string; reason: string }[];
  onFiles: (files: File[]) => void;
  onRemove: (item: UploadItem) => void;
  onKindChange: (item: UploadItem, kind: SourceKind) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const count = items.filter((i) => i.status !== "removing").length;

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6 ${
        spec.wide ? "md:col-span-2" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id={`${inputId}-title`} className="m-0 font-bold text-[16px]">
            {spec.title}
          </h2>
          <span className="text-[13px] text-muted">{spec.subtitle}</span>
        </div>
        {count > 0 && (
          <span className="whitespace-nowrap rounded-full bg-accent-tint px-2.5 py-1 font-semibold text-[12px] text-accent-strong">
            {count} {count === 1 ? "file" : "files"}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item) => (
            <li key={item.localId}>
              <FileRow
                item={item}
                kinds={spec.kinds}
                onRemove={onRemove}
                onKindChange={onKindChange}
                disabled={disabled}
              />
            </li>
          ))}
        </ul>
      )}

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed p-4 text-center ${
          dragging ? "border-accent bg-accent-tint" : "border-[#C9CFC9] bg-[#FAFBF9]"
        } ${disabled ? "cursor-default opacity-60" : ""}`}
      >
        <input
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          disabled={disabled}
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
          className="absolute size-px opacity-0"
        />
        <span className="font-semibold text-[14px]">
          Drop files or <span className="text-accent-strong">browse</span>
        </span>
        <span className="text-[12px] text-muted">{spec.hint}</span>
      </label>

      {rejected.length > 0 && (
        <ul role="alert" className="m-0 flex list-none flex-col gap-1 p-0 text-[12px] text-blocked">
          {rejected.map((r) => (
            <li key={r.name}>
              {r.name}: {r.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One file: icon, name, kind select (when there is a choice), type and size, remove, progress. */
export function FileRow({
  item,
  kinds,
  onRemove,
  onKindChange,
  disabled,
}: {
  item: UploadItem;
  kinds: { value: SourceKind; label: string }[];
  onRemove: (item: UploadItem) => void;
  onKindChange: (item: UploadItem, kind: SourceKind) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-[10px] border bg-surface px-3 py-2.5 text-[13px] ${
        item.status === "failed" ? "border-blocked" : "border-line"
      } ${item.status === "removing" ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-3">
        <FileIcon type={item.type} />
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        {kinds.length > 1 ? (
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <span className="sr-only">Source kind for {item.name}</span>
            <select
              value={item.sourceKind}
              disabled={disabled || item.status === "removing"}
              onChange={(e) => onKindChange(item, e.target.value as SourceKind)}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink"
            >
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <span className="hidden whitespace-nowrap font-medium text-muted tabular-nums sm:inline">
          {describeFile(item)}
        </span>
        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          disabled={disabled || item.status === "removing"}
          onClick={() => onRemove(item)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-page hover:text-ink disabled:opacity-50"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      {item.status === "uploading" && (
        <div
          role="progressbar"
          aria-label={`Uploading ${item.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={item.progress}
          className="h-1.5 overflow-hidden rounded-full bg-page"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      )}
      {item.status === "failed" && (
        <span role="alert" className="text-[12px] text-blocked">
          {item.error ?? "Upload failed."} Remove it and try again.
        </span>
      )}
    </div>
  );
}

function FileIcon({ type }: { type: UploadItem["type"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#4B5752",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "shrink-0",
  };
  if (type === "application/pdf") {
    return (
      <svg aria-hidden="true" {...common}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" {...common}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m3 16 5-5 4 4 3-3 6 6" />
      <circle cx="16" cy="9" r="1.5" />
    </svg>
  );
}
