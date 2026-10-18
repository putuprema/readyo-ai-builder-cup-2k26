// Route constants shared by server components (generateStaticParams) and client code.
// Kept free of "use client" so the server can read them as plain values.

/** The id a dynamic page is prerendered with under the static export (web/lib/route-id.ts). */
export const STATIC_PLACEHOLDER_ID = "_";
