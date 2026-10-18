// The browser's Firebase app: Auth for sign-in and ID tokens, Firestore for the live reads
// (goals, run status, analyses). Created lazily so the static export never initialises it at
// build time. With NEXT_PUBLIC_USE_EMULATORS=1 both connect to the local emulators
// (firebase.json ports) under the demo project the seed scripts use.
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, type Firestore, getFirestore } from "firebase/firestore";

export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";
const EMULATOR_PROJECT = "demo-adidi";
const EMULATOR_HOST = "127.0.0.1";
const AUTH_EMULATOR_PORT = 9099;
const FIRESTORE_EMULATOR_PORT = 8085;

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

function config() {
  if (USE_EMULATORS) {
    return { apiKey: "demo-key", projectId: EMULATOR_PROJECT, appId: "demo" };
  }
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) {
    throw new Error(
      "Set NEXT_PUBLIC_FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_API_KEY (web/.env.example), or NEXT_PUBLIC_USE_EMULATORS=1",
    );
  }
  return {
    apiKey,
    projectId,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

export function firebaseApp(): FirebaseApp {
  if (!app) app = getApps()[0] ?? initializeApp(config());
  return app;
}

export function firebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(firebaseApp());
    if (USE_EMULATORS) {
      connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, {
        disableWarnings: true,
      });
    }
  }
  return auth;
}

export function firestore(): Firestore {
  if (!db) {
    db = getFirestore(firebaseApp());
    if (USE_EMULATORS) connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  }
  return db;
}
