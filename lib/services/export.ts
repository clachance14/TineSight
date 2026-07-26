import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'

/**
 * Photo data for export with camera and detection info
 */
export interface PhotoForExport {
  id: string
  file_path: string
  captured_at: string | null
  imported_at: string
  camera: {
    name: string | null
  } | null
  bestDetection: {
    sex: string | null
    estimated_point_range: string | null
    // Generated lower bound (migrations 051/052) — authoritative point count.
    point_min: number | null
  } | null
  has_deer: boolean | null
}

/**
 * Result of downloading a photo buffer from storage
 */
export interface DownloadResult {
  data: ArrayBuffer | null
  error: Error | null
}

/**
 * Result of uploading a ZIP to storage
 */
export interface UploadResult {
  path: string | null
  error: Error | null
}

/**
 * Get photos for export with camera name and best detection
 * Joins to cameras table for camera name and detections table for best detection (highest confidence)
 */
export async function getPhotosForExport(
  userId: string,
  photoIds: string[]
): Promise<{
  data: PhotoForExport[] | null
  error: Error | null
}> {
  if (photoIds.length === 0) {
    return { data: [], error: null }
  }

  const supabase = await createClient()

  // Get photos with camera info
  const { data: photos, error: photosError } = await supabase
    .from('images')
    .select('id, file_path, captured_at, imported_at, has_deer, camera:camera_id(name)')
    .eq('user_id', userId)
    .in('id', photoIds)

  if (photosError !== null) {
    return { data: null, error: photosError }
  }

  if (!photos || photos.length === 0) {
    return { data: [], error: null }
  }

  // Get best detection for each photo (highest confidence, non-deleted)
  const { data: detections, error: detectionsError } = await supabase
    .from('detections')
    .select('image_id, sex, estimated_point_range, point_min, confidence')
    .in('image_id', photoIds)
    .is('deleted_at', null)
    .order('confidence', { ascending: false })

  if (detectionsError !== null) {
    return { data: null, error: detectionsError }
  }

  // Map best detection per image (first one due to ordering by confidence desc)
  const bestDetectionMap = new Map<string, { sex: string | null; estimated_point_range: string | null; point_min: number | null }>()

  for (const detection of detections ?? []) {
    if (!bestDetectionMap.has(detection.image_id)) {
      bestDetectionMap.set(detection.image_id, {
        sex: detection.sex,
        estimated_point_range: detection.estimated_point_range,
        point_min: detection.point_min,
      })
    }
  }

  // Combine data
  const photosForExport: PhotoForExport[] = photos.map(photo => ({
    id: photo.id,
    file_path: photo.file_path,
    captured_at: photo.captured_at,
    imported_at: photo.imported_at,
    camera: photo.camera,
    bestDetection: bestDetectionMap.get(photo.id) ?? null,
    has_deer: photo.has_deer,
  }))

  return { data: photosForExport, error: null }
}

/**
 * Generate a unique export filename for a photo
 * Format: TineSight_{date}_{camera}_{deer}.{ext}
 * - Date: captured_at if available, else imported_at (YYYY-MM-DD)
 * - Camera: First 15 chars, sanitized (omit entirely if null)
 * - Deer: Best detection by confidence: Buck10 / Doe / Fawn / NoDeer
 * - Handles collisions with _2, _3, etc.
 */
export function generateExportFilename(
  photo: PhotoForExport,
  usedFilenames: Map<string, number>
): string {
  // Extract file extension
  const ext = photo.file_path.split('.').pop()?.toLowerCase() ?? 'jpg'

  // Format date: use captured_at if available, else imported_at
  const dateToUse = photo.captured_at ?? photo.imported_at
  const formattedDate = format(new Date(dateToUse), 'yyyy-MM-dd')

  // Sanitize camera name: first 15 chars, replace spaces and special chars with -
  let cameraPart = ''
  if (photo.camera?.name) {
    const sanitized = photo.camera.name
      .substring(0, 15)
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes

    if (sanitized) {
      cameraPart = `_${sanitized}`
    }
  }

  // Determine deer classification
  let deerPart = 'NoDeer'
  if (photo.has_deer === true && photo.bestDetection) {
    const sex = photo.bestDetection.sex?.toLowerCase()

    if (sex === 'buck') {
      // Use the generated lower bound (migrations 051/052) rather than re-parsing
      // the free-text range: a bare /(\d+)/ yields nothing for "spike", "fork" and
      // "unknown", so those bucks all exported as plain "Buck".
      const points = photo.bestDetection.point_min
      deerPart = points != null ? `Buck${points}` : 'Buck'
    } else if (sex === 'doe') {
      deerPart = 'Doe'
    } else if (sex === 'fawn') {
      deerPart = 'Fawn'
    }
  }

  // Build base filename
  const baseFilename = `TineSight_${formattedDate}${cameraPart}_${deerPart}.${ext}`

  // Handle collisions
  const collisionCount = usedFilenames.get(baseFilename) ?? 0
  usedFilenames.set(baseFilename, collisionCount + 1)

  if (collisionCount === 0) {
    return baseFilename
  }

  // Add collision suffix before extension
  const nameWithoutExt = baseFilename.substring(0, baseFilename.lastIndexOf('.'))
  return `${nameWithoutExt}_${collisionCount + 1}.${ext}`
}

/**
 * Download a photo buffer from Supabase Storage
 */
export async function downloadPhotoBuffer(filePath: string): Promise<DownloadResult> {
  const supabase = await createClient()

  const { data, error } = await supabase.storage
    .from('photos')
    .download(filePath)

  if (error !== null) {
    return { data: null, error }
  }

  if (!data) {
    return { data: null, error: new Error('No data returned from storage') }
  }

  // Convert Blob to ArrayBuffer
  const arrayBuffer = await data.arrayBuffer()

  return { data: arrayBuffer, error: null }
}

/**
 * Upload a completed ZIP file to the exports bucket
 * Path: {userId}/{filename}
 */
export async function uploadZipToStorage(
  userId: string,
  zipBuffer: Buffer,
  filename: string
): Promise<UploadResult> {
  const supabase = await createClient()

  const filePath = `${userId}/${filename}`

  const { error } = await supabase.storage
    .from('exports')
    .upload(filePath, zipBuffer, {
      contentType: 'application/zip',
      upsert: true, // Allow overwriting if filename exists
    })

  if (error !== null) {
    return { path: null, error }
  }

  return { path: filePath, error: null }
}

/**
 * Generate a signed URL for downloading a ZIP file
 * Valid for 1 hour
 */
export async function getExportDownloadUrl(filePath: string): Promise<{
  data: string | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase.storage
    .from('exports')
    .createSignedUrl(filePath, 3600) // 1 hour expiry

  if (error !== null) {
    return { data: null, error }
  }

  return { data: data.signedUrl, error: null }
}
