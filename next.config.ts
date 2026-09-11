import type { NextConfig } from "next";

// Static export: the whole app is plain HTML/JS/CSS, deployable to Cloudflare Pages
// (free, commercial use allowed). All data is read in the browser via Supabase + RLS.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
