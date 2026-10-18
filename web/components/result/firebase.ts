"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, type Firestore, getFirestore } from "firebase/firestore";

// Firebase for the progress and result pages. Kept inside components/result/ so it does not
// collide with the shell's sign-in work (specs/10-ui-goal-creation.md); once that lands the
// pages can switch to the shared client. Config comes from NEXT_PUBLIC_FIREBASE_* (see
// web/.env.example); with NEXT_PUBLIC_FIREBASE_EMULATORS=1 the Auth and Firestore emulators of
// scripts/with-emulators.sh (project demo-adidi) are used instead.

export const usingEmulators = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1";
export const EMULATOR_PROJECT_ID = "demo-adidi";

const projectId = usingEmulators
  ? EMULATOR_PROJECT_ID
  : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

/** False when no Firebase project is configured: the pages then show the demo analysis. */
export const firebaseConfigured = Boolean(projectId);

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

function firebaseApp(): FirebaseApp {
  if (app) return app;
  app =
    getApps()[0] ??
    initializeApp({
      apiKey: usingEmulators ? "demo-api-key" : process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: usingEmulators ? undefined : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId,
    });
  return app;
}

export function firebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(firebaseApp());
  if (usingEmulators) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  return auth;
}

export function firestoreDb(): Firestore {
  if (db) return db;
  db = getFirestore(firebaseApp());
  if (usingEmulators) connectFirestoreEmulator(db, "127.0.0.1", 8085);
  return db;
}
