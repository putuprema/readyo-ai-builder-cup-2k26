"use client";

import Link from "next/link";
import { initialsOf, useAuth } from "@/lib/auth";

export type NavTab = "goals" | "documents" | "assumptions";

// Header from the design (docs/screens.md, "Global"): logo, the three tabs and the user.
// A tab is highlighted only on the list page it stands for; goal creation and the result
// page pass no `active`, so the step chips are the only "you are here" indicator there.
const TABS: { id: NavTab; label: string; href: string }[] = [
  { id: "goals", label: "Goals", href: "/goals/" },
  { id: "documents", label: "Documents", href: "/documents/" },
  { id: "assumptions", label: "Assumptions", href: "/assumptions/" },
];

export function SiteHeader({ active }: { active?: NavTab }) {
  const { state, signOut } = useAuth();

  return (
    <header className="border-line border-b bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-[1120px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-extrabold text-[17px] text-ink tracking-[-0.01em] no-underline"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 18 10 12l4 4 6-8" />
            </svg>
          </span>
          [APP NAME]
        </Link>

        {state.status === "signed_in" && (
          <nav
            aria-label="Main"
            className="order-last flex w-full flex-wrap gap-1 sm:order-none sm:ml-4 sm:w-auto"
          >
            {TABS.map((tab) => {
              const selected = tab.id === active;
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  aria-current={selected ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-lg px-3.5 text-[15px] no-underline ${
                    selected
                      ? "bg-accent-tint font-bold text-accent-strong"
                      : "font-medium text-muted hover:bg-page hover:text-ink"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3">
          {state.status === "signed_in" && (
            <>
              <span className="hidden text-[13px] text-muted sm:inline">{state.user.email}</span>
              <span
                aria-hidden="true"
                className="inline-flex size-9 items-center justify-center rounded-full bg-avatar font-bold text-[13px] text-accent-strong"
              >
                {initialsOf(state.user)}
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="min-h-11 rounded-lg px-3 font-semibold text-[14px] text-muted hover:bg-page hover:text-ink"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
