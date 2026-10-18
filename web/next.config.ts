import type { NextConfig } from "next";

// Static export: Firebase Hosting serves web/out. Auth and Firestore run in the browser,
// so no Node server is needed for the web app.
//
// The export is only switched on for `next build`. In `next dev` a dynamic route such as
// /goals/[id]/result would otherwise refuse every id that generateStaticParams did not list,
// and the export can only list the placeholder id (firebase.json rewrites the real ids to it).
const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "production" ? { output: "export" } : {}),
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
