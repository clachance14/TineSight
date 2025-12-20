import exifr from 'exifr'
import { getDeviceIdentifier, type ExifData } from './brand-parsers'

export interface ExtractedMetadata {
  capturedAt: Date | null
  make: string | null
  model: string | null
  deviceIdentifier: string | null
  exifSignature: string | null
  rawExif: Record<string, unknown>
}

/**
 * Extract EXIF metadata from a File object (browser-compatible)
 * Uses exifr library for parsing
 */
export async function extractMetadata(file: File): Promise<ExtractedMetadata> {
  try {
    // Parse EXIF from file
    const exif: ExifData | null = await exifr.parse(file, {
      // Request specific tags we need
      pick: ['Make', 'Model', 'ImageDescription', 'DateTimeOriginal', 'DateTime'],
    })

    if (!exif) {
      return createEmptyMetadata()
    }

    const make = exif.Make || null
    const model = exif.Model || null
    const deviceIdentifier = getDeviceIdentifier(exif)

    // Parse capture date (prefer DateTimeOriginal, fallback to DateTime)
    // exifr returns Date objects directly, not strings
    const dateValue = exif.DateTimeOriginal || exif.DateTime
    let capturedAt: Date | null = null
    if (dateValue instanceof Date) {
      capturedAt = dateValue
    } else if (typeof dateValue === 'string') {
      capturedAt = parseExifDate(dateValue)
    }

    // Generate signature for camera matching
    const exifSignature = await generateSignature(make, model, deviceIdentifier)

    return {
      capturedAt,
      make,
      model,
      deviceIdentifier,
      exifSignature,
      rawExif: sanitizeExifData(exif as Record<string, unknown>),
    }
  } catch (error) {
    console.warn('Failed to extract EXIF:', error)
    return createEmptyMetadata()
  }
}

function createEmptyMetadata(): ExtractedMetadata {
  return {
    capturedAt: null,
    make: null,
    model: null,
    deviceIdentifier: null,
    exifSignature: null,
    rawExif: {},
  }
}

/**
 * Sanitize EXIF data for PostgreSQL storage
 * - Removes null bytes and other invalid characters that can't be stored in JSONB
 * - Converts Date objects to ISO strings
 */
function sanitizeExifData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      sanitized[key] = null
    } else if (value instanceof Date) {
      // Convert Date objects to ISO strings
      sanitized[key] = value.toISOString()
    } else if (typeof value === 'string') {
      // Remove null bytes and other control characters
      sanitized[key] = value.replace(/\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeExifData(value as Record<string, unknown>)
    } else if (Array.isArray(value)) {
      // Sanitize array elements
      sanitized[key] = value.map((item) => {
        if (item instanceof Date) return item.toISOString()
        if (typeof item === 'string') {
          return item.replace(/\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        }
        return item
      })
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

/**
 * Parse EXIF date string (format: "YYYY:MM:DD HH:MM:SS")
 */
function parseExifDate(dateStr: string): Date | null {
  try {
    // EXIF uses colons in date: "2025:10:11 18:20:54"
    const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
    const date = new Date(normalized)
    return isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

/**
 * Generate camera signature hash (browser-compatible)
 */
async function generateSignature(
  make: string | null,
  model: string | null,
  deviceId: string | null
): Promise<string | null> {
  if (!make && !model && !deviceId) return null

  const data = `${make || ''}:${model || ''}:${deviceId || ''}`

  // Use Web Crypto API (browser-compatible)
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
