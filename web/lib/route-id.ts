"use client";

import { useEffect, useState } from "react";

// Dynamic routes under the static export (next.config.ts, `output: "export"`): a page such as
// /goals/[id]/documents is prerendered once with the placeholder id "_" and Firebase Hosting
// rewrites every /goals/*/documents URL to that file (firebase.json). The real id is therefore
// read from the browser's URL, not from the route params, which hold the placeholder.

export const STATIC_PLACEHOLDER_ID = "_";

/**
 * The URL path segment at `index` (0-based, after the leading slash): for
 * "/goals/abc123/documents/" and index 1 → "abc123". Null until mounted (the static HTML is
 * the same for every id) and null when the segment is missing or is the placeholder.
 */
export function useRouteSegment(index: number): string | null {
  const [segment, setSegment] = useState<string | null>(null);
  useEffect(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const value = parts[index] ?? null;
    setSegment(value === STATIC_PLACEHOLDER_ID ? null : value);
  }, [index]);
  return segment;
}
