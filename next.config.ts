import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The whole OS runs in the browser, so `next build` emits plain files to out/ (served by nginx in Docker).
  output: "export",
  // GitHub Pages serves the repo at /win8-metro/; the Pages workflow sets BASE_PATH, Docker leaves it empty.
  basePath: process.env.BASE_PATH || "",
  // This app lives in a sub-folder of the blog repo; keep Next from treating the parent as the workspace root.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
