/**
 * Duplicate Detection Client
 *
 * Client-side helper for checking and filtering duplicate files before upload.
 * Uses filename + size matching to detect duplicates in user's library.
 * Enables interrupted upload recovery by skipping already-uploaded files.
 */

import type {
  DuplicateCheckFile,
  DuplicateCheckResponse,
  FileWithMetadataExtended,
} from './types'
import { createRetryFetch } from './retry'

/**
 * Maximum files to check per API request
 * API limit is 1000, but we batch for performance
 */
const BATCH_SIZE = 500

/**
 * Client for checking duplicates before upload
 *
 * Wraps the /api/photos/check-duplicates endpoint to efficiently
 * identify files that already exist in the user's library.
 *
 * @example
 * const checker = new DuplicateChecker()
 *
 * // Check specific files
 * const result = await checker.checkDuplicates([
 *   { filename: 'photo1.jpg', size: 1024000 },
 *   { filename: 'photo2.jpg', size: 2048000 }
 * ])
 * console.log(`${result.duplicateCount} duplicates found`)
 *
 * // Filter upload queue
 * const uniqueFiles = await checker.filterDuplicates(uploadQueue)
 */
export class DuplicateChecker {
  private retryFetch: typeof fetch

  /**
   * Create a new DuplicateChecker instance
   *
   * @param options - Optional configuration
   * @param options.maxRetries - Max retry attempts (default: 3)
   * @param options.timeout - Request timeout in ms (default: 30000)
   */
  constructor(options?: { maxRetries?: number; timeout?: number }) {
    this.retryFetch = createRetryFetch({
      maxRetries: options?.maxRetries ?? 3,
      timeout: options?.timeout ?? 30000,
    })
  }

  /**
   * Check which files are duplicates
   *
   * Queries the API to identify files that already exist in the user's
   * library based on filename + size matching.
   *
   * @param files - Array of {filename, size} to check
   * @returns Object with existing (skip) and toUpload arrays
   *
   * @example
   * const result = await checker.checkDuplicates([
   *   { filename: 'DCIM_0001.jpg', size: 3145728 },
   *   { filename: 'DCIM_0002.jpg', size: 2897152 }
   * ])
   *
   * console.log('Existing:', result.existing)  // ['DCIM_0001.jpg']
   * console.log('To upload:', result.toUpload) // ['DCIM_0002.jpg']
   */
  async checkDuplicates(
    files: DuplicateCheckFile[]
  ): Promise<DuplicateCheckResponse> {
    if (files.length === 0) {
      return {
        existing: [],
        toUpload: [],
        totalChecked: 0,
        duplicateCount: 0,
      }
    }

    // For small batches, single request
    if (files.length <= BATCH_SIZE) {
      return this.checkBatch(files)
    }

    // For large batches, parallel requests
    const batches: DuplicateCheckFile[][] = []
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      batches.push(files.slice(i, i + BATCH_SIZE))
    }

    const results = await Promise.all(batches.map((batch) => this.checkBatch(batch)))

    // Merge results
    const existing: string[] = []
    const toUpload: string[] = []
    let duplicateCount = 0

    for (const result of results) {
      existing.push(...result.existing)
      toUpload.push(...result.toUpload)
      duplicateCount += result.duplicateCount
    }

    return {
      existing,
      toUpload,
      totalChecked: files.length,
      duplicateCount,
    }
  }

  /**
   * Check a single batch of files
   */
  private async checkBatch(files: DuplicateCheckFile[]): Promise<DuplicateCheckResponse> {
    const response = await this.retryFetch('/api/photos/check-duplicates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files }),
    })

    return response.json() as Promise<DuplicateCheckResponse>
  }

  /**
   * Filter out duplicate files from upload queue
   *
   * Checks all files against the user's library and updates file statuses
   * to 'skipped' for duplicates. Returns only files that need uploading.
   *
   * @param files - Array of FileWithMetadataExtended to filter
   * @returns Array of files that should be uploaded (non-duplicates)
   *
   * @example
   * const allFiles = [...] // 1000 files with metadata
   * const toUpload = await checker.filterDuplicates(allFiles)
   * console.log(`Uploading ${toUpload.length} of ${allFiles.length} files`)
   */
  async filterDuplicates(
    files: FileWithMetadataExtended[]
  ): Promise<FileWithMetadataExtended[]> {
    if (files.length === 0) {
      return []
    }

    // Extract filename and size for dedup check
    const checkFiles: DuplicateCheckFile[] = files.map((f) => ({
      filename: f.filename,
      size: f.size,
    }))

    const result = await this.checkDuplicates(checkFiles)

    // Create a Set for O(1) lookup
    const existingSet = new Set(result.existing)

    // Filter and update statuses
    const toUpload: FileWithMetadataExtended[] = []

    for (const file of files) {
      if (existingSet.has(file.filename)) {
        // Mark as skipped (duplicate)
        file.status = 'skipped'
      } else {
        // Keep for upload
        toUpload.push(file)
      }
    }

    return toUpload
  }
}

/**
 * Create a duplicate checker instance
 *
 * Factory function for creating DuplicateChecker with default options.
 *
 * @returns New DuplicateChecker instance
 */
export function createDuplicateChecker(): DuplicateChecker {
  return new DuplicateChecker()
}

/**
 * Quick check for duplicates without creating a class instance
 *
 * Convenience function for one-off duplicate checks.
 *
 * @param files - Array of {filename, size} to check
 * @returns Promise with duplicate check results
 *
 * @example
 * const { existing, toUpload, duplicateCount } = await quickDuplicateCheck([
 *   { filename: 'photo.jpg', size: 1024000 }
 * ])
 */
export async function quickDuplicateCheck(
  files: DuplicateCheckFile[]
): Promise<DuplicateCheckResponse> {
  const checker = new DuplicateChecker()
  return checker.checkDuplicates(files)
}
