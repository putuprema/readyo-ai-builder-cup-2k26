"use client";

import {
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  type User,
} from "firebase/auth";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { firebaseAuth } from "./firebase";

// Who is signed in. `loading` until Firebase Auth has restored the session from storage, so
// pages can tell "not signed in" from "not known yet" and avoid flashing the sign-in card.

export type AuthState =
  | { status: "loading"; user: null }
  | { status: "signed_out"; user: null }
  | { status: "signed_in"; user: User };

interface AuthContextValue {
  state: AuthState;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth(), (user) => {
      setState(user ? { status: "signed_in", user } : { status: "signed_out", user: null });
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      async signIn(email, password) {
        await signInWithEmailAndPassword(firebaseAuth(), email, password);
      },
      async signOut() {
        await firebaseSignOut(firebaseAuth());
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth needs an AuthProvider above it");
  return value;
}

/** The signed-in user, or null while loading or signed out. */
export function useUser(): User | null {
  return useAuth().state.user;
}

/** Initials for the avatar: "Dimas" → "D", "demo@adidi.app" → "D". */
export function initialsOf(user: User): string {
  const source = user.displayName?.trim() || user.email || "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 && user.displayName ? (parts[1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

/** A user-readable message for the Firebase Auth error codes the sign-in form can hit. */
export function signInErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "That email and password do not match an account.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/network-request-failed":
      return "Could not reach the sign-in service. Check your connection.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
