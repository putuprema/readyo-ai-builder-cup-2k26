"use client";

import { useEffect, useRef } from "react";
import { CONFIRM_COPY } from "./delete";

// The confirmation for deleting an active goal: a native modal <dialog>, so focus is trapped
// and Escape cancels; showModal() focuses the first button (Keep it). Opens while `open` is true.

export function ConfirmDeleteDialog({
  open,
  goalName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  goalName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="delete-goal-title"
      aria-describedby="delete-goal-body"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-[rgba(20,33,28,0.45)]"
    >
      <div className="flex flex-col gap-3 p-6">
        <h2 id="delete-goal-title" className="m-0 font-extrabold text-[20px] tracking-[-0.01em]">
          {CONFIRM_COPY.title}
        </h2>
        <p className="m-0 font-semibold text-[15px]">{goalName}</p>
        <p id="delete-goal-body" className="m-0 text-[14px] text-muted">
          {CONFIRM_COPY.body}
        </p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 cursor-pointer rounded-xl border border-[#C9CFC9] bg-surface px-[18px] font-semibold text-[14px] text-ink hover:bg-page"
          >
            {CONFIRM_COPY.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 cursor-pointer rounded-xl border-0 bg-blocked px-[18px] font-bold text-[14px] text-white hover:bg-[#8A1A12]"
          >
            {CONFIRM_COPY.confirm}
          </button>
        </div>
      </div>
    </dialog>
  );
}
