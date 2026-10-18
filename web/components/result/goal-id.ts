"use client";

import { useEffect, useState } from "react";

// The static export (next.config.ts) can only pre-render fixed paths, so /goals/[id]/* is
// exported once under the placeholder id below and Firebase Hosting rewrites every goal id to
// it (firebase.json). The real id therefore comes from the browser's URL, not from params.
export const PLACEHOLDER_GOAL_ID = "_";

/** The goal id from a /goals/{id}/... pathname, or null when the path has none. */
export function goalIdFromPath(pathname: string): string | null {
  const match = /^\/goals\/([^/]+)(?:\/|$)/.exec(pathname);
  const id = match?.[1];
  if (!id || id === PLACEHOLDER_GOAL_ID) return null;
  return decodeURIComponent(id);
}

/** The goal id of the current page; null until mounted or when the URL has none. */
export function useGoalId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(goalIdFromPath(window.location.pathname));
  }, []);
  return id;
}
