"use client";

import type { User } from "firebase/auth";
import { useAuth } from "@/lib/auth";

// The signed-in user for the result and progress pages, from the shell's AuthProvider.

export type UserState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; user: User };

export function useUser(): UserState {
  const { state } = useAuth();
  return state.status === "signed_in" ? { status: "signed_in", user: state.user } : state;
}
