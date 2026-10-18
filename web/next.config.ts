import type { NextConfig } from "next";

// Static export: Firebase Hosting serves web/out. Auth and Firestore run in the browser,
// so no Node server is needed for the web app.
//
// Dynamic pages (/goals/[id]/documents, spec 11's progress and result) are prerendered once
// with a placeholder id; Firebase Hosting rewrites every goal's URL to that file
// (firebase.json) and the page reads the real id from the URL (web/lib/route-id.ts). `next dev`
// has no Hosting in front of it and refuses ids outside generateStaticParams under
// `output: "export"`, so development runs without the export flag and serves the dynamic
// routes directly; the build is unchanged.
const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "development" ? {} : { output: "export" as const }),
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
