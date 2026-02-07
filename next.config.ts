import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    NEXT_AI_API_KEY: process.env.NEXT_AI_API_KEY || "",
  },
  transpilePackages: ["@ducanh2912/next-pwa"],
};

export default withPWA(nextConfig);
