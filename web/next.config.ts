import type { NextConfig } from "next";

// Addresses of the Kubbo3D sites: the real ones when building for production, localhost while developing.
// Each can be changed with its variable.
const production = process.env.NODE_ENV === "production";
const site = (value: string | undefined, live: string, local: string) => value || (production ? live : local);

const nextConfig: NextConfig = {
  // Browser-visible variables are named PB_* instead of NEXT_PUBLIC_*, so Next.js only inlines
  // the ones listed here.
  env: {
    PB_SUPABASE_URL: process.env.PB_SUPABASE_URL ?? "",
    PB_SUPABASE_PUBLISHABLE_KEY: process.env.PB_SUPABASE_PUBLISHABLE_KEY ?? "",
    PB_COOKIE_DOMAIN: process.env.PB_COOKIE_DOMAIN ?? "",
    PB_CATALOG_DOMAIN: process.env.PB_CATALOG_DOMAIN ?? "",
    PB_CATALOG_CNAME: process.env.PB_CATALOG_CNAME ?? "",
    PB_LANDING_URL: site(process.env.PB_LANDING_URL, "https://kubbo3d.com", "http://localhost:3000"),
    PB_TOOLS_URL: site(process.env.PB_TOOLS_URL, "https://tools.kubbo3d.com", "http://localhost:3002"),
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;