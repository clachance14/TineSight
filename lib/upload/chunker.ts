/**
 * File Chunking Utilities
 *
 * Split files into chunks for efficient batch upload.
 * Uses CHUNK_SIZE from config (25 files per chunk).
 */

import { UPLOAD_CONFIG } from './config'
import type { FileWithMetadata, UploadChunk } from './types'

/**
 * Split an array into chunks of specified size.
 *
 * @param array - Array to split
 * @param chunkSize - Maximum items per chunk
 * @returns Array of chunks
 *
 * @example
 * const items = [1, 2, 3, 4, 5, 6, 7]
 * const chunks = chunkArray(items, 3)
 * // Result: [[1, 2, 3], [4, 5, 6], [7]]
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be a positive integer')
  }

  if (array.length === 0) {
    return []
  }

  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

/**
 * Create upload chunks from files with metadata.
 * Groups files for efficient batch processing.
 *
 * @param files - Files with extracted metadata
 * @param chunkSize - Files per chunk (defaults to UPLOAD_CONFIG.CHUNK_SIZE)
 * @returns Array of upload chunks with index and file info
 *
 * @example
 * const files: FileWithMetadata[] = [...]
 * const chunks = createUploadChunks(files)
 * // Result: [{ index: 0, files: [...], count: 25 }, ...]
 */
export function createUploadChunks(
  files: FileWithMetadata[],
  chunkSize: number = UPLOAD_CONFIG.CHUNK_SIZE
): UploadChunk[] {
  if (files.length === 0) {
    return []
  }

  const chunkedFiles = chunkArray(files, chunkSize)

  return chunkedFiles.map((chunk, index) => ({
    index,
    files: chunk,
    count: chunk.length,
  }))
}

/**
 * Calculate the total number of chunks for a given file count.
 *
 * @param totalFiles - Total number of files
 * @param chunkSize - Files per chunk (defaults to UPLOAD_CONFIG.CHUNK_SIZE)
 * @returns Number of chunks needed
 */
export function calculateChunkCount(
  totalFiles: number,
  chunkSize: number = UPLOAD_CONFIG.CHUNK_SIZE
): number {
  if (totalFiles <= 0) {
    return 0
  }
  return Math.ceil(totalFiles / chunkSize)
}

/**
 * Get the chunk index for a specific file index.
 *
 * @param fileIndex - Zero-based file index
 * @param chunkSize - Files per chunk (defaults to UPLOAD_CONFIG.CHUNK_SIZE)
 * @returns Zero-based chunk index
 */
export function getChunkIndex(
  fileIndex: number,
  chunkSize: number = UPLOAD_CONFIG.CHUNK_SIZE
): number {
  if (fileIndex < 0) {
    throw new Error('fileIndex must be non-negative')
  }
  return Math.floor(fileIndex / chunkSize)
}

/**
 * Get the file indices for a specific chunk.
 *
 * @param chunkIndex - Zero-based chunk index
 * @param totalFiles - Total number of files
 * @param chunkSize - Files per chunk (defaults to UPLOAD_CONFIG.CHUNK_SIZE)
 * @returns Object with start and end indices (end is exclusive)
 */
export function getChunkFileRange(
  chunkIndex: number,
  totalFiles: number,
  chunkSize: number = UPLOAD_CONFIG.CHUNK_SIZE
): { start: number; end: number } {
  const start = chunkIndex * chunkSize
  const end = Math.min(start + chunkSize, totalFiles)
  return { start, end }
}

/**
 * Estimate upload time for a chunk based on file sizes.
 *
 * @param files - Files in the chunk
 * @param bytesPerSecond - Current upload speed
 * @returns Estimated seconds to upload the chunk
 */
export function estimateChunkUploadTime(
  files: FileWithMetadata[],
  bytesPerSecond: number
): number {
  if (bytesPerSecond <= 0 || files.length === 0) {
    return 0
  }

  const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0)
  return totalBytes / bytesPerSecond
}
