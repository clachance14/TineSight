import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize package imports to avoid bundling entire libraries
  // lucide-react has 1000+ icons - this transforms barrel imports to direct imports
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
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
  // Enable Turbopack (Next.js 16 default)
  // Web Workers work natively in modern browsers without special bundler config
  turbopack: {},
};

export default nextConfig;
