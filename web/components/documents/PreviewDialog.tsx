"use client";

import { useEffect, useRef } from "react";
import type { UploadItem } from "@/lib/documents";
import { previewKind, previewSrc, previewSubtitle } from "@/lib/preview";

// Shows one file of the documents step before Submit: a native modal <dialog>, so focus stays
// inside and Escape closes it; the browser returns focus to the Preview button. PDFs show in a
// frame, screenshots as an image; "Open in new tab" is the fallback for browsers (most phones)
// that do not show a PDF inside a page. Full screen on a phone. Open while `item` is set.

export function PreviewDialog({ item, onClose }: { item: UploadItem | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const open = Boolean(item?.previewUrl);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      close.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop click mirrors Escape and the Close button
    <dialog
      ref={dialog}
      aria-labelledby="preview-title"
      aria-describedby="preview-subtitle"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog itself.
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-surface p-0 text-ink backdrop:bg-ink/40 sm:m-auto sm:h-[min(880px,calc(100dvh-48px))] sm:w-[min(960px,calc(100vw-48px))] sm:rounded-2xl sm:border sm:border-line"
    >
      {item?.previewUrl && (
        <div className="flex h-full flex-col">
          <div className="flex items-start gap-3 border-line border-b py-2 pr-2 pl-4 sm:pl-5">
            <div className="flex min-w-0 flex-1 flex-col pt-2">
              <h2 id="preview-title" className="m-0 break-all font-bold text-[16px] leading-snug">
                {item.name}
              </h2>
              <span id="preview-subtitle" className="text-[13px] text-muted">
                {previewSubtitle(item)}
              </span>
              <a
                href={item.previewUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-[13px] text-accent-strong"
              >
                Open in new tab
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
            </div>
            <button
              ref={close}
              type="button"
              aria-label="Close preview"
              onClick={onClose}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-page hover:text-ink"
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
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
          <div className="min-h-0 flex-1 bg-page">
            {previewKind(item.type) === "pdf" ? (
              <iframe
                src={previewSrc(item.previewUrl, item.type)}
                title={`Preview of ${item.name}`}
                className="block h-full w-full border-0"
              />
            ) : (
              <div className="h-full overflow-auto p-4">
                {/* biome-ignore lint/performance/noImgElement: an object URL, not an optimisable asset */}
                <img
                  src={item.previewUrl}
                  alt={`Preview of ${item.name}`}
                  className="mx-auto block h-auto max-w-full"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
