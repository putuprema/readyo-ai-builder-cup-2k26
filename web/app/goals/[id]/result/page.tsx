import type { Metadata } from "next";
import { ResultScreen } from "@/components/result/ResultScreen";

export const metadata: Metadata = { title: "Your readiness · Readyo" };

// Static export: one placeholder path ("_", see components/result/goal-id.ts); Firebase
// Hosting rewrites /goals/*/result to it and the screen reads the real goal id from the URL.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function ResultRoutePage() {
  return <ResultScreen />;
}
