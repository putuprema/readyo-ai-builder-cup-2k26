"use client";

import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { firestore, firebaseAuth as sharedAuth, USE_EMULATORS } from "@/lib/firebase";

// Firebase for the progress and result pages: the shell's shared client (web/lib/firebase.ts),
// so these pages see the same signed-in user as the rest of the app. A second app with its own
// config kept the session under another storage key and fell back to the demo account.

export const usingEmulators = USE_EMULATORS;

/** False when no Firebase project is configured: the pages then show the demo analysis. */
export const firebaseConfigured =
  USE_EMULATORS || Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

export function firebaseAuth(): Auth {
  return sharedAuth();
}

export function firestoreDb(): Firestore {
  return firestore();
}
