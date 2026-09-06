import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { assertExportSize } from '@/lib/export/limits'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
type ExportClient = SupabaseClient<Database>

/**
 * Photo data for export with camera and detection info
 */
export interface PhotoForExport {
  id: string
  file_path: string
  file_size_bytes?: number | null
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
  photoIds: string[],
  client?: ExportClient
): Promise<{
  data: PhotoForExport[] | null
  error: Error | null
}> {
  if (photoIds.length === 0) {
    return { data: [], error: null }
  }

  const supabase = client ?? await createClient()

  const result: PhotoForExport[] = []
  const uniqueIds = [...new Set(photoIds)]
  // Keep UUID filters below proxy URL limits. Fetch only each image's best live
  // detection so large exports never rely on a truncated global detection list.
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const { data: photos, error } = await supabase
      .from('images')
      .select('id, file_path, file_size_bytes, captured_at, imported_at, has_deer, camera:camera_id(name), detections(sex, estimated_point_range, point_min, confidence)')
      .eq('user_id', userId)
      .in('id', uniqueIds.slice(offset, offset + 100))
      .is('detections.deleted_at', null)
      .order('confidence', { referencedTable: 'detections', ascending: false, nullsFirst: false })
      .order('id', { referencedTable: 'detections', ascending: true })
      .limit(1, { referencedTable: 'detections' })
    if (error) return { data: null, error }
    for (const photo of photos ?? []) {
      if (photo.file_path.split('/')[0] !== userId || /(^|\/)\.{1,2}(\/|$)|[%\\]/.test(photo.file_path)) {
        return { data: null, error: new Error('Invalid photo storage ownership') }
      }
      const best = photo.detections[0]
      result.push({
        id: photo.id, file_path: photo.file_path, file_size_bytes: photo.file_size_bytes, captured_at: photo.captured_at,
        imported_at: photo.imported_at, has_deer: photo.has_deer, camera: photo.camera,
        bestDetection: best ? { sex: best.sex, estimated_point_range: best.estimated_point_range, point_min: best.point_min } : null,
      })
    }
  }
  try { assertExportSize(result) } catch (error) { return { data: null, error: error as Error } }
  return { data: result, error: null }
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
export async function downloadPhotoBuffer(filePath: string, client?: ExportClient): Promise<DownloadResult> {
  const supabase = client ?? await createClient()

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
  zipBuffer: Buffer | NodeJS.ReadableStream,
  filename: string,
  client?: ExportClient
): Promise<UploadResult> {
  const supabase = client ?? await createClient()

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
export async function getExportDownloadUrl(filePath: string, client?: ExportClient): Promise<{
  data: string | null
  error: Error | null
}> {
  const supabase = client ?? await createClient()

  const { data, error } = await supabase.storage
    .from('exports')
    .createSignedUrl(filePath, 3600) // 1 hour expiry

  if (error !== null) {
    return { data: null, error }
  }

  return { data: data.signedUrl, error: null }
}
