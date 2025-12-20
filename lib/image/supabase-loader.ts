/**
 * Supabase Image Loader for Next.js
 *
 * This module provides utilities for working with Supabase Storage images
 * and Next.js Image optimization.
 *
 * Key insight: Next.js can optimize images from Supabase signed URLs because:
 * 1. The remotePatterns in next.config.ts allows *.supabase.co/storage/**
 * 2. When `unoptimized` is false, Next.js downloads, resizes, and converts to WebP
 * 3. The cache key is based on the full URL, so signed URL changes = cache miss
 *    This is acceptable because:
 *    - Images are relatively static (trail camera photos don't change)
 *    - The optimization benefit (WebP, resizing) outweighs cache overhead
 *    - Signed URLs typically have long expiry times (1 hour default)
 */

import type { ImageLoaderProps } from 'next/image'

/**
 * Custom loader for Supabase images
 * Passes through to Next.js optimization, maintaining signed URL parameters
 */
export function supabaseLoader({ src, width, quality }: ImageLoaderProps): string {
  // For Supabase signed URLs, we pass through directly
  // Next.js will handle optimization via /_next/image
  const url = new URL(src)
  url.searchParams.set('w', width.toString())
  if (quality) {
    url.searchParams.set('q', quality.toString())
  }
  return url.toString()
}

/**
 * Check if a URL is a Supabase Storage URL
 */
export function isSupabaseStorageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname.endsWith('.supabase.co') && parsed.pathname.includes('/storage/')
  } catch {
    return false
  }
}

/**
 * Default image sizes for responsive images
 * Based on TineSight's common viewport breakpoints
 */
export const RESPONSIVE_SIZES = {
  grid: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw',
  thumbnail: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  lightbox: '100vw',
} as const
