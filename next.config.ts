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

  },
  transpilePackages: ["@ducanh2912/next-pwa"],
  turbopack: {
    // TODO: Remove this when the issue is fixed
    //
  },
};

export default withPWA(nextConfig);
