import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    NEXT_AI_API_KEY: process.env.NEXT_AI_API_KEY || "",
  },
};

export default nextConfig;
