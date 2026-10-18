"use client";

import { type DragEvent, type ReactNode, useId, useState } from "react";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents";

// The two drop zones of the check-in (artboard 5): the amber "Missing" slot in a source row
// and the "Add a new source" zone. Each is a real <label> around a file input.

export function MissingSlot({
  hint,
  sourceTitle,
  onFiles,
  disabled,
}: {
  hint: string;
  sourceTitle: string;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  return (
    <DropLabel
      onFiles={onFiles}
      disabled={disabled}
      multiple={false}
      inputLabel={`Add this month's file for ${sourceTitle}`}
      className="min-h-12 justify-between gap-2.5 rounded-[10px] border-[#E3B57A] bg-[#FEF9F2] px-3 py-2 text-[13px]"
      draggingClassName="border-accent bg-accent-tint"
    >
      <span className="text-[#6B3A08]">
        <strong>Missing.</strong> {hint}
      </span>
      <span aria-hidden="true" className="whitespace-nowrap font-bold text-accent-strong">
        Add file
      </span>
    </DropLabel>
  );
}

export function AddSourceZone({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  return (
    <DropLabel
      onFiles={onFiles}
      disabled={disabled}
      multiple
      inputLabel="Add a new source"
      className="min-h-16 flex-[1_1_320px] gap-3.5 rounded-xl border-[#C9CFC9] bg-[#FAFBF9] px-[18px] py-3"
      draggingClassName="border-accent bg-accent-tint"
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#4B5752"
        strokeWidth="2"
        strokeLinecap="round"
        className="shrink-0"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span className="flex flex-col">
        <span className="font-semibold text-[14px]">Add a new source</span>
        <span className="text-[12px] text-muted">
          New account, new loan, a card you didn't upload before
        </span>
      </span>
    </DropLabel>
  );
}

function DropLabel({
  onFiles,
  disabled,
  multiple,
  inputLabel,
  className,
  draggingClassName,
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  multiple: boolean;
  inputLabel: string;
  className: string;
  draggingClassName: string;
  children: ReactNode;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    onFiles(multiple ? files : files.slice(0, 1));
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`relative flex cursor-pointer items-center border-[1.5px] border-dashed focus-within:outline-2 focus-within:outline-accent ${className} ${
        dragging ? draggingClassName : ""
      } ${disabled ? "cursor-default opacity-60" : ""}`}
    >
      <input
        id={id}
        type="file"
        multiple={multiple}
        accept={ACCEPT_ATTRIBUTE}
        aria-label={inputLabel}
        disabled={disabled}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
        className="absolute size-px opacity-0"
      />
      {children}
    </label>
  );
}
