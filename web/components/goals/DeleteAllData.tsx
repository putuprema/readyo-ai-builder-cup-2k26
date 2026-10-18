"use client";

import { useState } from "react";
import { deleteAllData } from "@/lib/account";
import { ApiError } from "@/lib/api";
import { ConfirmDialog } from "./ConfirmDeleteDialog";
import { DELETE_ALL_COPY, deleteAllErrorMessage } from "./delete";

// The goals list footer: a quiet "Delete all my data" link-button and its confirmation
// (docs/product.md, "Privacy"). On success the Firestore listener empties the list by itself,
// so the page shows the no-goals state; this only reports the outcome.

export function DeleteAllData() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteAllData();
      setOpen(false);
      setDone(true);
    } catch (e) {
      setError(deleteAllErrorMessage(e instanceof ApiError ? e.code : "unknown"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <footer className="mt-4 flex flex-col items-start gap-2 border-line border-t pt-5">
      {done && (
        <p role="status" className="m-0 text-[14px] text-muted">
          {DELETE_ALL_COPY.done}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setError(null);
          setDone(false);
          setOpen(true);
        }}
        className="-mx-2 min-h-11 cursor-pointer rounded-lg border-0 bg-transparent px-2 font-semibold text-[13px] text-muted underline underline-offset-2 hover:text-blocked"
      >
        {DELETE_ALL_COPY.action}
      </button>

      <ConfirmDialog
        id="delete-all"
        open={open}
        title={DELETE_ALL_COPY.title}
        confirmLabel={busy ? "Deleting" : DELETE_ALL_COPY.confirm}
        cancelLabel={DELETE_ALL_COPY.cancel}
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => void confirm()}
      >
        <p className="m-0 text-[14px]">This removes:</p>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px]">
          {DELETE_ALL_COPY.removes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="m-0 text-[14px] text-muted">{DELETE_ALL_COPY.keeps}</p>
        {error && (
          <p role="alert" className="m-0 text-[13px] text-blocked">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </footer>
  );
}
