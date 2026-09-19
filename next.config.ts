import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@temporalio/client", "pg"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
