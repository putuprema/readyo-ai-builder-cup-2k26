"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { CONFIRM_COPY } from "./delete";

// Confirmations on the goals list: a native modal <dialog>, so focus is trapped and Escape
// cancels; showModal() focuses the first button (the cancel one). Opens while `open` is true.

export function ConfirmDialog({
  id,
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  busy = false,
  onCancel,
  onConfirm,
}: {
  /** Prefix for the title and body ids. */
  id: string;
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
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
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-[rgba(20,33,28,0.45)]"
    >
      <div className="flex flex-col gap-3 p-6" aria-busy={busy}>
        <h2 id={`${id}-title`} className="m-0 font-extrabold text-[20px] tracking-[-0.01em]">
          {title}
        </h2>
        <div id={`${id}-body`} className="flex flex-col gap-3">
          {children}
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 cursor-pointer rounded-xl border border-[#C9CFC9] bg-surface px-[18px] font-semibold text-[14px] text-ink hover:bg-page disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-11 cursor-pointer rounded-xl border-0 bg-blocked px-[18px] font-bold text-[14px] text-white hover:bg-[#8A1A12] disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Deleting one active goal. */
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
  return (
    <ConfirmDialog
      id="delete-goal"
      open={open}
      title={CONFIRM_COPY.title}
      confirmLabel={CONFIRM_COPY.confirm}
      cancelLabel={CONFIRM_COPY.cancel}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <p className="m-0 font-semibold text-[15px]">{goalName}</p>
      <p className="m-0 text-[14px] text-muted">{CONFIRM_COPY.body}</p>
    </ConfirmDialog>
  );
}
