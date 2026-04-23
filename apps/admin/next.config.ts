import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const adminDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(adminDir, "../..");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.223", "localhost"],
  turbopack: {
    root: monorepoRoot,
  },
  experimental: {
    authInterrupts: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

export default withSentryConfig(withNextIntl(nextConfig as any), {
  org: "wymedia",
  project: "javascript-nextjs",
  silent: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
