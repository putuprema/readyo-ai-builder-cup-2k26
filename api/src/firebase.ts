import { type App, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { TokenVerifier } from "./auth.js";

// Firebase Admin uses Application Default Credentials: the Cloud Run service account in
// production, `gcloud auth application-default login` locally. With FIREBASE_AUTH_EMULATOR_HOST
// set, tokens are verified against the Auth emulator instead.

let app: App | undefined;

export function firebaseApp(): App {
  if (!app) {
    app =
      getApps()[0] ??
      initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
      });
  }
  return app;
}

export const verifyFirebaseIdToken: TokenVerifier = async (idToken) => {
  try {
    const decoded = await getAuth(firebaseApp()).verifyIdToken(idToken);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
};
