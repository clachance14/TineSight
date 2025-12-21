import { createClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'
import type { Tables } from '@/types/database'

// Camera row type from database
export type Camera = Tables<'cameras'>

// Camera with photo count from aggregated query
export interface CameraWithPhotoCount extends Camera {
  photo_count: number
}

export interface CameraMetadata {
  make: string | null
  model: string | null
  deviceIdentifier: string | null
  exifSignature: string | null
}

/**
 * Generate camera signature from metadata
 * Returns SHA256 hash of "{make}:{model}:{deviceIdentifier}"
 * Returns null if all fields are null
 */
export function generateCameraSignature(
  make: string | null,
  model: string | null,
  deviceIdentifier: string | null
): string | null {
  // If all fields are null, return null
  if (!make && !model && !deviceIdentifier) {
    return null
  }

  // Create signature from available fields (use empty string for null values)
  const signatureString = `${make || ''}:${model || ''}:${deviceIdentifier || ''}`

  // Generate SHA256 hash
  return createHash('sha256')
    .update(signatureString)
    .digest('hex')
}

/**
 * Generate auto-name for camera
 * Examples:
 * - "MUDDY MUD_MTC16 (MP:05)"
 * - "Bushnell Core DS-4K"
 * - "Unknown Camera"
 */
export function generateCameraName(metadata: CameraMetadata): string {
  const { make, model, deviceIdentifier } = metadata

  // If we have no metadata, return generic name
  if (!make && !model && !deviceIdentifier) {
    return 'Unknown Camera'
  }

  // Build name parts
  const parts: string[] = []

  if (make) {
    parts.push(make)
  }

  if (model) {
    parts.push(model)
  }

  // Join make and model
  const baseName = parts.join(' ')

  // Add device identifier in parentheses if available
  if (deviceIdentifier) {
    return `${baseName} (${deviceIdentifier})`.trim()
  }

  // Return base name or "Unknown Camera" if still empty
  return baseName || 'Unknown Camera'
}

/**
 * Find existing camera by EXIF signature or create a new one
 * Auto-generates name: "{Make} {Model} ({DeviceID})"
 *
 * @param userId - User ID who owns the camera
 * @param metadata - Camera metadata from EXIF
 * @returns Camera ID or error
 */
export async function findOrCreateCamera(
  userId: string,
  metadata: CameraMetadata
): Promise<{ data: { id: string } | null; error: Error | null }> {
  try {
    const supabase = await createClient()

    // Generate signature from metadata
    const signature = generateCameraSignature(
      metadata.make,
      metadata.model,
      metadata.deviceIdentifier
    )

    // If we have a signature, try to find existing camera
    if (signature) {
      const { data: existingCamera, error: findError } = await supabase
        .from('cameras')
        .select('id')
        .eq('user_id', userId)
        .eq('exif_signature', signature)
        .maybeSingle()

      if (findError) {
        return { data: null, error: new Error(`Failed to find camera: ${findError.message}`) }
      }

      // If found, return existing camera
      if (existingCamera) {
        return { data: { id: existingCamera.id }, error: null }
      }
    }

    // Create new camera with auto-generated name
    const cameraName = generateCameraName(metadata)

    const { data: newCamera, error: createError } = await supabase
      .from('cameras')
      .insert({
        user_id: userId,
        name: cameraName,
        make: metadata.make,
        model: metadata.model,
        device_identifier: metadata.deviceIdentifier,
        exif_signature: signature,
      })
      .select('id')
      .single()

    if (createError) {
      return { data: null, error: new Error(`Failed to create camera: ${createError.message}`) }
    }

    return { data: { id: newCamera.id }, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unknown error in findOrCreateCamera'),
    }
  }
}

/**
 * Get all cameras for a user with photo counts
 */
export async function getCameras(
  userId: string
): Promise<{
  data: CameraWithPhotoCount[] | null
  error: Error | null
}> {
  const supabase = await createClient()

  // Query cameras with image count using Supabase's aggregation
  const { data, error } = await supabase
    .from('cameras')
    .select(`
      *,
      images(count)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    return { data: null, error }
  }

  // Transform response to include photo_count
  const cameras: CameraWithPhotoCount[] = (data ?? []).map((camera) => {
    // Supabase returns count as array with single object: [{count: N}]
    const photoCount = Array.isArray(camera.images)
      ? camera.images[0]?.count ?? 0
      : 0

    // Remove the images array from the result
    const { images, ...cameraData } = camera

    return {
      ...cameraData,
      photo_count: photoCount,
    } as CameraWithPhotoCount
  })

  return { data: cameras, error: null }
}
