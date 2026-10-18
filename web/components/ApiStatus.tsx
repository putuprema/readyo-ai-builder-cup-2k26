"use client";

import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface Health {
  ok: boolean;
  service: string;
  version: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ok"; health: Health }
  | { kind: "error"; message: string };

function isHealth(value: unknown): value is Health {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ok === "boolean" && typeof v.service === "string" && typeof v.version === "string"
  );
}

export function ApiStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback((signal?: AbortSignal) => {
    setState({ kind: "loading" });
    fetch(`${API_URL}/health`, { signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: unknown = await res.json();
        if (!isHealth(body)) throw new Error("Unexpected response shape");
        setState({ kind: "ok", health: body });
      })
      .catch((err: unknown) => {
        if (signal?.aborted) return;
        const message = err instanceof Error ? err.message : "Request failed";
        setState({ kind: "error", message });
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-[12px] text-muted uppercase tracking-[0.06em]">
          API status
        </span>
        <StatusPill state={state} />
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[14px]">
        <dt className="text-muted">Endpoint</dt>
        <dd className="break-all font-mono text-[13px]">{API_URL}/health</dd>
        {state.kind === "ok" && (
          <>
            <dt className="text-muted">Service</dt>
            <dd>{state.health.service}</dd>
            <dt className="text-muted">Version</dt>
            <dd className="font-mono text-[13px]">{state.health.version}</dd>
          </>
        )}
        {state.kind === "error" && (
          <>
            <dt className="text-muted">Error</dt>
            <dd className="text-blocked">{state.message}</dd>
          </>
        )}
      </dl>

      {state.kind === "ok" && (
        <pre className="overflow-x-auto rounded-[14px] bg-page p-4 font-mono text-[13px]">
          {JSON.stringify(state.health, null, 2)}
        </pre>
      )}

      {state.kind === "error" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-[13px] text-muted">
            Start the api with <code>pnpm --filter api dev</code>, then try again.
          </p>
          <button
            type="button"
            onClick={() => load()}
            className="min-h-11 rounded-xl border border-line bg-surface px-4 font-semibold text-[14px] text-ink hover:bg-page"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function StatusPill({ state }: { state: State }) {
  const dot =
    state.kind === "ok" ? "bg-passes" : state.kind === "error" ? "bg-blocked" : "bg-muted";
  const label =
    state.kind === "ok" ? "Reachable" : state.kind === "error" ? "Unreachable" : "Checking";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full bg-page px-3 py-1 font-semibold text-[13px]"
      aria-live="polite"
    >
      <span className={`size-2.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
