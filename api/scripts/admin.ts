// Shared setup for the seed scripts: which project to write to and a firebase-admin app.
// Credentials come from Application Default Credentials. On the emulators none are needed;
// firebase-admin still looks for them once and prints a MetadataLookupWarning, which is harmless.
import { type App, getApps, initializeApp } from "firebase-admin/app";

export const onEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

/** The project id from the environment, or the fixed demo project on the emulators. */
export function resolveProjectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    (onEmulator ? "demo-adidi" : undefined)
  );
}

export function adminApp(projectId: string): App {
  return getApps()[0] ?? initializeApp({ projectId });
}
