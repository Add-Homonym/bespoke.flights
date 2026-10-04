import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local development database) loads its WASM and data files from
  // its own package directory, so it must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
