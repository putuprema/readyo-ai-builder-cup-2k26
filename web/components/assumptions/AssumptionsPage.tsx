"use client";

import { firestorePaths, type Override, type RuleValue } from "@adidi/shared";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/lib/auth";
import { firestore } from "@/lib/firebase";
import { type RuleGroup, type RuleRow, ruleGroups } from "./model";

// 7 · Assumptions (docs/screens.md "7"), read-only in this milestone: the rules from the
// `rules` collection (readable by any signed-in user) and the user's own overrides, if any,
// shown next to the default. Editing, Recalculate and Reset are out of scope
// (specs/13-ui-monthly-assumptions.md).

export function AssumptionsPage() {
  return (
    <>
      <SiteHeader active="assumptions" />
      <RequireAuth>
        <Assumptions />
      </RequireAuth>
    </>
  );
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; groups: RuleGroup[] };

function useRuleGroups(uid: string | null): State {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const db = firestore();
    Promise.all([
      getDocs(collection(db, "rules")),
      getDocs(collection(db, `${firestorePaths.user(uid)}/overrides`)).catch(() => null),
    ])
      .then(([rules, overrides]) => {
        if (cancelled) return;
        const values = rules.docs.map((d) => ({ ...(d.data() as RuleValue), id: d.id }));
        const own = overrides?.docs.map((d) => ({ ...(d.data() as Override), ruleId: d.id })) ?? [];
        setState({ status: "ready", groups: ruleGroups(values, own) });
      })
      .catch((err: Error) => !cancelled && setState({ status: "error", message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [uid]);
  return state;
}

function Assumptions() {
  const { state: auth } = useAuth();
  const state = useRuleGroups(auth.user?.uid ?? null);
  const [lending, ...lists] = state.status === "ready" ? state.groups : [];

  return (
    <main className="mx-auto box-border flex w-full max-w-[1120px] flex-col gap-7 px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-extrabold text-[30px] leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
          Assumptions
        </h1>
        <p className="m-0 max-w-[680px] text-muted">
          Every number the analysis assumes instead of reading from your statements. Each one has a
          source and the date we last checked it.
        </p>
      </div>

      {state.status === "loading" && (
        <p className="m-0 text-[15px] text-muted" aria-busy="true">
          Loading the assumptions
        </p>
      )}
      {state.status === "error" && (
        <p
          role="alert"
          className="m-0 rounded-[10px] bg-[#FDECEA] px-3.5 py-3 text-[13px] text-blocked"
        >
          Could not load the assumptions: {state.message}
        </p>
      )}
      {state.status === "ready" && !lending && (
        <p
          role="status"
          className="m-0 rounded-[10px] bg-[#FEF6EC] px-3.5 py-3 text-[#6B3A08] text-[13px]"
        >
          No assumptions are loaded yet.
        </p>
      )}

      {lending && <RulesTable group={lending} />}
      {lists.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {lists.map((group) => (
            <RulesList key={group.id} group={group} />
          ))}
        </div>
      )}

      {state.status === "ready" && lending && (
        <p className="m-0 border-line border-t pt-5 text-[13px] text-muted">
          Defaults are reviewed by the [APP NAME] team. Changing a value for your own account is
          coming soon.
        </p>
      )}
    </main>
  );
}

function GroupHeading({ group }: { group: RuleGroup }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 id={`group-${group.id}`} className="m-0 font-bold text-[18px]">
        {group.title}
      </h2>
      <span className="text-[13px] text-muted">{group.subtitle}</span>
    </div>
  );
}

function Value({ row }: { row: RuleRow }) {
  if (!row.override) return <span className="font-bold tabular-nums">{row.value}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-bold tabular-nums">{row.override}</span>
      <span className="text-[12px] text-[#8A4A0B]">Your value · default {row.value}</span>
    </span>
  );
}

function Source({ row }: { row: RuleRow }) {
  const title = <span className="line-clamp-2">{row.source.title}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {row.source.url ? (
        <a
          href={row.source.url}
          target="_blank"
          rel="noreferrer"
          title={row.source.title}
          className="font-semibold no-underline"
        >
          {title}
        </a>
      ) : (
        <span title={row.source.title}>{title}</span>
      )}
      <span className="text-[12px]">Checked {row.checked}</span>
    </span>
  );
}

/** Lending rules: Rule · Value · Used for · Source · checked; stacked under 768 px. */
function RulesTable({ group }: { group: RuleGroup }) {
  return (
    <section
      aria-labelledby={`group-${group.id}`}
      className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 sm:px-7 sm:py-6"
    >
      <GroupHeading group={group} />
      <table className="w-full border-collapse text-[14px] max-md:block">
        <thead className="max-md:hidden">
          <tr className="text-left text-[12px] text-muted uppercase tracking-[0.06em]">
            <th scope="col" className="w-[30%] border-line border-b pt-2 pr-3 pb-2.5 font-semibold">
              Rule
            </th>
            <th scope="col" className="w-[14%] border-line border-b px-3 pt-2 pb-2.5 font-semibold">
              Value
            </th>
            <th scope="col" className="w-[20%] border-line border-b px-3 pt-2 pb-2.5 font-semibold">
              Used for
            </th>
            <th scope="col" className="border-line border-b pt-2 pb-2.5 pl-3 font-semibold">
              Source · checked
            </th>
          </tr>
        </thead>
        <tbody className="max-md:flex max-md:flex-col">
          {group.rows.map((row) => (
            <tr
              key={row.id}
              className={`border-[#F0F2EE] border-b align-top last:border-b-0 max-md:flex max-md:flex-col max-md:gap-1 max-md:py-3 ${
                row.override ? "bg-[#FEF9F2]" : ""
              }`}
            >
              <th scope="row" className="py-3 pr-3 text-left font-bold max-md:p-0">
                {row.label}
              </th>
              <td className="px-3 py-3 max-md:p-0">
                <span className="sr-only md:hidden">Value: </span>
                <Value row={row} />
              </td>
              <td className="px-3 py-3 text-muted max-md:p-0">
                <span className="sr-only md:hidden">Used for: </span>
                {row.usedFor}
              </td>
              <td className="py-3 pl-3 text-muted max-md:p-0">
                <Source row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Prices and rates, Savings returns, Readiness checks: a definition list per card. */
function RulesList({ group }: { group: RuleGroup }) {
  return (
    <section
      aria-labelledby={`group-${group.id}`}
      className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 sm:px-7 sm:py-6"
    >
      <GroupHeading group={group} />
      <dl className="m-0 flex flex-col">
        {group.rows.map((row) => (
          <div
            key={row.id}
            className="flex items-start justify-between gap-3 border-[#F0F2EE] border-b py-3 last:border-b-0"
          >
            <dt className="flex min-w-0 flex-col gap-0.5">
              <span className="font-bold">{row.label}</span>
              <span className="text-[12px] text-muted">{row.usedFor}</span>
              <span className="text-[12px] text-muted">
                <Source row={row} />
              </span>
            </dt>
            <dd className="m-0 whitespace-nowrap text-right">
              <Value row={row} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
