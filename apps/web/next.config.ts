import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@audit-evidence/engine"],
  turbopack: {},
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"]
    };
    return config;
  }
};

export default nextConfig;
