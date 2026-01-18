/**
 * Web Worker for EXIF Extraction
 *
 * Extracts EXIF metadata from photo file slices using the exifr library.
 * Receives 128KB ArrayBuffer slices via Transferable Objects for optimal performance.
 *
 * Message Protocol:
 * - Input: { id: string, buffer: ArrayBuffer }
 * - Output: { id: string, success: boolean, exif?: ExifData, error?: string }
 */

import exifr from 'exifr'

/**
 * Extracted EXIF metadata structure
 */
export interface ExifData {
  /** Camera manufacturer */
  make?: string
  /** Camera model */
  model?: string
  /** Date/time photo was captured */
  dateTimeOriginal?: Date | string
  /** GPS latitude in decimal degrees */
  latitude?: number
  /** GPS longitude in decimal degrees */
  longitude?: number
  /** Image width in pixels */
  imageWidth?: number
  /** Image height in pixels */
  imageHeight?: number
}

/**
 * Message sent to worker
 */
export interface WorkerInput {
  id: string
  buffer: ArrayBuffer
}

/**
 * Message returned from worker
 */
export interface WorkerOutput {
  id: string
  success: boolean
  exif?: ExifData | undefined
  error?: string | undefined
}

/**
 * EXIF fields to extract from the file
 * Using exifr's pick option for efficient selective parsing
 */
const EXIF_PICK_FIELDS = [
  'Make',
  'Model',
  'DateTimeOriginal',
  'GPSLatitude',
  'GPSLongitude',
  'ImageWidth',
  'ImageHeight',
  // Alternative field names that may be present
  'ExifImageWidth',
  'ExifImageHeight',
  'PixelXDimension',
  'PixelYDimension',
] as const

/**
 * Parse EXIF data from an ArrayBuffer slice
 */
async function parseExif(buffer: ArrayBuffer): Promise<ExifData | null> {
  try {
    const result = await exifr.parse(buffer, {
      pick: [...EXIF_PICK_FIELDS],
      // Enable GPS parsing for latitude/longitude
      gps: true,
      // Parse dates as Date objects
      reviveValues: true,
    })

    if (!result) {
      return null
    }

    // Normalize the result to our ExifData structure
    const exifData: ExifData = {}

    // Camera info
    if (result.Make) {
      exifData.make = String(result.Make).trim()
    }
    if (result.Model) {
      exifData.model = String(result.Model).trim()
    }

    // Capture date
    if (result.DateTimeOriginal) {
      exifData.dateTimeOriginal = result.DateTimeOriginal
    }

    // GPS coordinates (exifr already calculates decimal degrees with gps: true)
    if (typeof result.latitude === 'number' && !isNaN(result.latitude)) {
      exifData.latitude = result.latitude
    }
    if (typeof result.longitude === 'number' && !isNaN(result.longitude)) {
      exifData.longitude = result.longitude
    }

    // Image dimensions - try multiple possible field names
    const width = result.ImageWidth ?? result.ExifImageWidth ?? result.PixelXDimension
    const height = result.ImageHeight ?? result.ExifImageHeight ?? result.PixelYDimension

    if (typeof width === 'number' && width > 0) {
      exifData.imageWidth = width
    }
    if (typeof height === 'number' && height > 0) {
      exifData.imageHeight = height
    }

    // Return null if no useful data was extracted
    if (Object.keys(exifData).length === 0) {
      return null
    }

    return exifData
  } catch {
    // Return null for files without valid EXIF (not an error condition)
    return null
  }
}

/**
 * Handle incoming messages from the main thread
 */
self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  const { id, buffer } = event.data

  try {
    const exif = await parseExif(buffer)

    const response: WorkerOutput = {
      id,
      success: true,
      exif: exif ?? undefined,
    }

    self.postMessage(response)
  } catch (error) {
    const response: WorkerOutput = {
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during EXIF extraction',
    }

    self.postMessage(response)
  }
}

// Signal that the worker is ready
self.postMessage({ type: 'ready' })
