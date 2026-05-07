import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  allowedDevOrigins: ['initiated-annual-chronic-dayton.trycloudflare.com'],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/firmware/**',
          '**/.next/**',
          '**/gateway/**',
          '**/plant_disease/**',
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
