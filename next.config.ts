import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Disable Next.js image optimization for Supabase signed URLs
    // Next.js appends &w=...&q=... which breaks Supabase signature validation
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/**',
      },
    ],
  },
};

export default nextConfig;
