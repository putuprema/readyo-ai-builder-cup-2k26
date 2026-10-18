import type { NextConfig } from "next";

// Static export: Firebase Hosting serves web/out. Auth and Firestore run in the browser,
// so no Node server is needed for the web app.
const nextConfig: NextConfig = {
  output: "export",
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
