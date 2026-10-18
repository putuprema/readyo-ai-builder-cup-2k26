"use client";

import { type FormEvent, useState } from "react";
import { signInErrorMessage, useAuth } from "@/lib/auth";

// Email and password sign-in (Firebase Auth). The demo account is demo@adidi.app
// (pnpm seed:demo); the password is never in the repo.
export function SignInCard({ title = "Sign in to continue" }: { title?: string }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(signInErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-[420px] flex-col gap-4 rounded-[20px] border border-line bg-surface p-6"
      aria-busy={busy}
    >
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-bold text-[18px]">{title}</h2>
        <p className="m-0 text-[13px] text-muted">
          Your goals and statements are tied to your account. Nothing is shared.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signin-email" className="font-semibold text-[13px]">
          Email
        </label>
        <input
          id="signin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-[10px] border border-[#C9CFC9] bg-surface px-3.5 text-[15px] text-ink"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signin-password" className="font-semibold text-[13px]">
          Password
        </label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 rounded-[10px] border border-[#C9CFC9] bg-surface px-3.5 text-[15px] text-ink"
        />
      </div>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-blocked">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-6 font-bold text-[15px] text-white disabled:opacity-60"
      >
        {busy ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
