import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone enables a self-contained server build ideal for Docker images
  output: "standalone",

  // Ensure Prisma uses the native Node runtime and is not bundled by the server bundler.
  // This avoids "@prisma/client did not initialize yet" during dev with Turbopack/webpack.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
