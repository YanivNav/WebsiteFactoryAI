import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @factory/shared is consumed straight from TypeScript source (no build step),
  // so Next has to transpile it.
  transpilePackages: ["@factory/shared"],
};

export default nextConfig;
