"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { SignInCard } from "./SignInCard";

// Wraps a page that needs a signed-in user: shows nothing while the session is being
// restored, the sign-in card when signed out, the page otherwise.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === "loading") {
    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 py-14 sm:px-8" aria-busy="true">
        <p className="m-0 text-[15px] text-muted">Loading your account</p>
      </main>
    );
  }
  if (state.status === "signed_out") {
    return (
      <main className="mx-auto flex w-full max-w-[1120px] flex-col items-start gap-6 px-4 py-14 sm:px-8">
        <SignInCard />
      </main>
    );
  }
  return <>{children}</>;
}
