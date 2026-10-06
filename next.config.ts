import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Nested inside another project that has its own lockfile — pin the root here.
  turbopack: { root: path.resolve(process.cwd()) },
};

export default nextConfig;
