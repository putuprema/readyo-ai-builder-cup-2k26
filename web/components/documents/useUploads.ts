"use client";

import type { SourceKind } from "@adidi/shared";
import { useEffect, useRef, useState } from "react";
import { type CardId, normalizedType, rejectReason, type UploadItem } from "@/lib/documents";
import { apiUploader, setDocumentKind, type Uploader } from "@/lib/uploader";

// The upload state shared by the documents step and the monthly check-in: files picked into
// a group (a card, or a check-in row) upload at once with progress, can be removed (the record
// and the stored file are deleted) or change kind, and the page warns before leaving while a
// file is still in flight. Nothing is read before Submit.

export interface AddOptions {
  /** Where refused files are reported: the card or the check-in row. */
  group: string;
  card: CardId;
  /** The kind for each file: one kind for all, or a guess from the file name. */
  sourceKind: SourceKind | ((fileName: string) => SourceKind);
  slot?: string;
}

export function useUploads({
  month,
  uploader = apiUploader,
  onNotice,
}: {
  month: string;
  uploader?: Uploader;
  onNotice: (message: string) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejected, setRejected] = useState<Record<string, { name: string; reason: string }[]>>({});
  const controllers = useRef(new Map<string, AbortController>());
  // The kind each file has now, so an upload that finishes after a change stores the new one.
  const kinds = useRef(new Map<string, SourceKind>());

  // Files in flight are lost on navigation; ask before leaving.
  const pending = items.some((i) => i.status === "uploading");
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  function patch(localId: string, update: Partial<UploadItem>) {
    setItems((list) => list.map((i) => (i.localId === localId ? { ...i, ...update } : i)));
  }

  function add(files: File[], options: AddOptions) {
    const refused: { name: string; reason: string }[] = [];
    for (const file of files) {
      const reason = rejectReason(file);
      const type = normalizedType(file);
      if (reason || !type) {
        refused.push({ name: file.name, reason: reason ?? "Unsupported file." });
        continue;
      }
      const localId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const item: UploadItem = {
        localId,
        card: options.card,
        sourceKind:
          typeof options.sourceKind === "function"
            ? options.sourceKind(file.name)
            : options.sourceKind,
        ...(options.slot ? { slot: options.slot } : {}),
        name: file.name,
        type,
        size: file.size,
        status: "uploading",
        progress: 0,
      };
      kinds.current.set(localId, item.sourceKind);
      setItems((list) => [...list, item]);
      void start(item, file);
    }
    setRejected((r) => ({ ...r, [options.group]: refused }));
  }

  async function start(item: UploadItem, file: File) {
    const controller = new AbortController();
    controllers.current.set(item.localId, controller);
    try {
      const { docId } = await uploader.upload({
        file,
        type: item.type,
        sourceKind: item.sourceKind,
        month,
        signal: controller.signal,
        onProgress: (progress) => patch(item.localId, { progress }),
      });
      patch(item.localId, { status: "uploaded", progress: 100, docId });
      const latestKind = kinds.current.get(item.localId);
      if (latestKind && latestKind !== item.sourceKind) await setDocumentKind(docId, latestKind);
    } catch (error) {
      if (controller.signal.aborted) return;
      patch(item.localId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      controllers.current.delete(item.localId);
    }
  }

  async function remove(item: UploadItem) {
    controllers.current.get(item.localId)?.abort();
    if (!item.docId) {
      setItems((list) => list.filter((i) => i.localId !== item.localId));
      return;
    }
    patch(item.localId, { status: "removing" });
    try {
      await uploader.remove(item.docId);
      setItems((list) => list.filter((i) => i.localId !== item.localId));
    } catch {
      patch(item.localId, { status: "uploaded", error: undefined });
      onNotice(`Could not remove ${item.name}. Try again.`);
    }
  }

  function changeKind(item: UploadItem, sourceKind: SourceKind) {
    kinds.current.set(item.localId, sourceKind);
    patch(item.localId, { sourceKind });
    if (item.docId) {
      setDocumentKind(item.docId, sourceKind).catch(() =>
        onNotice(`Could not change the kind of ${item.name}. Try again.`),
      );
    }
  }

  return { items, rejected, add, remove, changeKind };
}
