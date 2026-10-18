import type { Metadata } from "next";
import { ProgressScreen } from "@/components/result/progress/ProgressScreen";

export const metadata: Metadata = { title: "Analysing your statements · [APP NAME]" };

// Static export: one placeholder path ("_", see components/result/goal-id.ts); Firebase
// Hosting rewrites /goals/*/progress to it and the screen reads the real goal id from the URL.
// The literal is repeated here because a "use client" module's exports are client references
// on the server, not plain values.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function ProgressPage() {
  return <ProgressScreen />;
}
