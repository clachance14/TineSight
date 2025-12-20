/**
 * HTTP Cache Headers Utility
 *
 * Provides consistent cache control headers for API routes.
 * All strategies use 'private' since data is user-specific.
 */

import { NextResponse } from 'next/server'

export type CacheStrategy =
  | 'no-store' // No caching (mutations, sensitive data)
  | 'private-short' // 30 seconds (frequently changing data like lists)
  | 'private-medium' // 5 minutes (stats, individual records)
  | 'private-long' // 30 minutes (rarely changing data)

interface CacheConfig {
  maxAge: number
  staleWhileRevalidate: number
}

const CACHE_CONFIGS: Record<CacheStrategy, CacheConfig | null> = {
  'no-store': null,
  'private-short': {
    maxAge: 30,
    staleWhileRevalidate: 60,
  },
  'private-medium': {
    maxAge: 300, // 5 minutes
    staleWhileRevalidate: 600, // 10 minutes
  },
  'private-long': {
    maxAge: 1800, // 30 minutes
    staleWhileRevalidate: 3600, // 1 hour
  },
}

/**
 * Get cache control header value for a strategy
 */
export function getCacheControlHeader(strategy: CacheStrategy): string {
  const config = CACHE_CONFIGS[strategy]

  if (!config) {
    return 'no-store, no-cache, must-revalidate'
  }

  return `private, max-age=${config.maxAge}, stale-while-revalidate=${config.staleWhileRevalidate}`
}

/**
 * Apply cache headers to a NextResponse
 */
export function withCacheHeaders<T>(
  response: NextResponse<T>,
  strategy: CacheStrategy
): NextResponse<T> {
  response.headers.set('Cache-Control', getCacheControlHeader(strategy))
  return response
}

/**
 * Create a JSON response with cache headers
 */
export function jsonWithCache<T>(
  data: T,
  strategy: CacheStrategy,
  init?: ResponseInit
): NextResponse<T> {
  const response = NextResponse.json(data, init)
  response.headers.set('Cache-Control', getCacheControlHeader(strategy))
  return response
}

/**
 * Route-specific cache strategy recommendations
 *
 * GET routes:
 * - /api/deer                    -> private-short (list changes frequently)
 * - /api/deer/[id]               -> private-medium (individual profile)
 * - /api/photos                  -> private-short (list with filters)
 * - /api/photos/stats            -> private-medium (aggregated stats)
 * - /api/photos/pending-matches  -> private-short (action-required list)
 * - /api/detections/[id]         -> private-medium (individual detection)
 * - /api/detections/[id]/matches -> private-short (match candidates)
 *
 * POST/PATCH/DELETE routes:
 * - All mutation routes          -> no-store
 */
