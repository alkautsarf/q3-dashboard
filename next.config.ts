// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
    // Extra guard: lint zero dirs during build to avoid flat-config enforcement
    dirs: [],
  },
  turbopack: { root: __dirname },
};

export default nextConfig;
