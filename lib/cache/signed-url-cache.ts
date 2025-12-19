/**
 * In-memory signed URL cache with automatic cleanup
 *
 * Supabase signed URLs are valid for 60 minutes by default.
 * We cache them for 50 minutes to ensure a 10-minute safety buffer.
 */

import { getSignedViewUrl } from '@/lib/services/photos'

interface CachedUrl {
  url: string
  expiresAt: number
}

// In-memory cache - persists for the lifetime of the server process
const urlCache = new Map<string, CachedUrl>()

// Cache configuration
const CACHE_TTL_MS = 50 * 60 * 1000 // 50 minutes (under 60-minute URL validity)
const MAX_CACHE_SIZE = 10000 // Maximum entries before cleanup
const CLEANUP_THRESHOLD = 8000 // Start cleanup when cache reaches this size

/**
 * Get a cached signed URL or generate a new one
 *
 * @param filePath - The storage file path
 * @returns The signed URL or null if generation failed
 */
export async function getCachedSignedUrl(filePath: string): Promise<string | null> {
  const now = Date.now()

  // Check cache first
  const cached = urlCache.get(filePath)
  if (cached && cached.expiresAt > now) {
    return cached.url
  }

  // Generate new signed URL
  const { data, error } = await getSignedViewUrl(filePath)

  if (error || !data) {
    // Remove stale entry if it exists
    urlCache.delete(filePath)
    return null
  }

  // Store in cache
  urlCache.set(filePath, {
    url: data,
    expiresAt: now + CACHE_TTL_MS,
  })

  // Trigger cleanup if cache is getting large
  if (urlCache.size > CLEANUP_THRESHOLD) {
    cleanupExpiredEntries()
  }

  return data
}

/**
 * Batch get cached signed URLs
 * Efficiently fetches multiple URLs with cache hits where possible
 *
 * @param filePaths - Array of storage file paths
 * @returns Array of signed URLs (null for failed paths)
 */
export async function getCachedSignedUrls(
  filePaths: string[]
): Promise<(string | null)[]> {
  const now = Date.now()
  const results: (string | null)[] = new Array(filePaths.length).fill(null)
  const uncachedIndices: number[] = []
  const uncachedPaths: string[] = []

  // Check cache for each path
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i]
    const cached = urlCache.get(filePath)

    if (cached && cached.expiresAt > now) {
      results[i] = cached.url
    } else {
      uncachedIndices.push(i)
      uncachedPaths.push(filePath)
    }
  }

  // Fetch uncached URLs in parallel
  if (uncachedPaths.length > 0) {
    const fetchPromises = uncachedPaths.map((path) => getSignedViewUrl(path))
    const fetchResults = await Promise.all(fetchPromises)

    // Update cache and results
    const fetchTime = Date.now()
    for (let j = 0; j < fetchResults.length; j++) {
      const { data, error } = fetchResults[j]
      const originalIndex = uncachedIndices[j]
      const filePath = uncachedPaths[j]

      if (!error && data) {
        results[originalIndex] = data
        urlCache.set(filePath, {
          url: data,
          expiresAt: fetchTime + CACHE_TTL_MS,
        })
      }
    }
  }

  // Trigger cleanup if cache is getting large
  if (urlCache.size > CLEANUP_THRESHOLD) {
    cleanupExpiredEntries()
  }

  return results
}

/**
 * Remove expired entries from the cache
 * Called automatically when cache exceeds threshold
 */
function cleanupExpiredEntries(): void {
  const now = Date.now()
  let removed = 0

  for (const [key, value] of urlCache) {
    if (value.expiresAt < now) {
      urlCache.delete(key)
      removed++
    }
  }

  // If still over max, remove oldest entries
  if (urlCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(urlCache.entries())
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt)

    const toRemove = urlCache.size - MAX_CACHE_SIZE + 1000 // Remove extra buffer
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      urlCache.delete(entries[i][0])
    }
  }
}

/**
 * Invalidate a specific cache entry
 * Use when a file is updated or deleted
 */
export function invalidateSignedUrl(filePath: string): void {
  urlCache.delete(filePath)
}

/**
 * Clear all cached URLs
 * Useful for testing or forced refresh
 */
export function clearSignedUrlCache(): void {
  urlCache.clear()
}

/**
 * Get cache statistics for debugging/monitoring
 */
export function getSignedUrlCacheStats(): {
  size: number
  maxSize: number
  ttlMs: number
} {
  return {
    size: urlCache.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMs: CACHE_TTL_MS,
  }
}
