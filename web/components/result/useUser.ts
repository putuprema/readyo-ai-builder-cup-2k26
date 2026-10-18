"use client";

import { DEMO_EMAIL } from "@adidi/shared";
import { onAuthStateChanged, signInWithEmailAndPassword, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { firebaseAuth, usingEmulators } from "./firebase";

// The signed-in user for the result and progress pages. Against the emulators, a signed-out
// visitor is signed in as the seeded demo account (api/scripts/seed-demo.ts, fixed test
// password), so the pages can be developed before the shell's sign-in exists. Never used
// against the real project: there the shell signs people in.

const DEMO_EMULATOR_PASSWORD = "demo-pass-2026";

export type UserState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; user: User };

export function useUser(): UserState {
  const [state, setState] = useState<UserState>({ status: "loading" });

  useEffect(() => {
    const auth = firebaseAuth();
    let devSignIn: Promise<unknown> | null = null;
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) {
        setState({ status: "signed_in", user });
        return;
      }
      if (usingEmulators && !devSignIn) {
        devSignIn = signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_EMULATOR_PASSWORD).catch(
          (err: unknown) => {
            console.warn("emulator demo sign-in failed; run pnpm seed:demo:emulator", err);
            setState({ status: "signed_out" });
          },
        );
        return;
      }
      setState({ status: "signed_out" });
    });
    return stop;
  }, []);

  return state;
}
