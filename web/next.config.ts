import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser-visible variables are named PB_* instead of NEXT_PUBLIC_*, so Next.js only inlines
  // the ones listed here.
  env: {
    PB_SUPABASE_URL: process.env.PB_SUPABASE_URL ?? "",
    PB_SUPABASE_PUBLISHABLE_KEY: process.env.PB_SUPABASE_PUBLISHABLE_KEY ?? "",
    PB_COOKIE_DOMAIN: process.env.PB_COOKIE_DOMAIN ?? "",
    PB_CATALOG_DOMAIN: process.env.PB_CATALOG_DOMAIN ?? "",
    PB_CATALOG_CNAME: process.env.PB_CATALOG_CNAME ?? "",
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