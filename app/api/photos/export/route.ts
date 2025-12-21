import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getPhotosForExport,
  generateExportFilename,
  downloadPhotoBuffer,
  type PhotoForExport,
} from '@/lib/services/export'
import { tasks } from '@trigger.dev/sdk/v3'
import archiver from 'archiver'
import { format } from 'date-fns'
import { Readable } from 'stream'

/**
 * Simple in-memory rate limiter
 * Tracks last export timestamp per user
 * 10 second cooldown between exports
 */
const exportRateLimits = new Map<string, number>()
const RATE_LIMIT_WINDOW_MS = 10 * 1000 // 10 seconds

/**
 * Check if user is rate limited
 * Returns true if rate limited, false if allowed
 */
function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const lastExport = exportRateLimits.get(userId)

  if (lastExport && now - lastExport < RATE_LIMIT_WINDOW_MS) {
    return true
  }

  exportRateLimits.set(userId, now)
  return false
}

/**
 * Validate UUID format
 */
function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

/**
 * POST /api/photos/export
 * Export photos with three modes based on count:
 * - 1 photo: Direct download URL
 * - 2-25 photos: Stream ZIP directly
 * - 26-500 photos: Background job
 */
export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Rate limit check
    if (isRateLimited(user.id)) {
      return NextResponse.json(
        { error: 'Rate limited. Please wait 10 seconds between exports.' },
        { status: 429 }
      )
    }

    // 3. Validate request body
    const body = await request.json()
    const { photoIds } = body

    if (!Array.isArray(photoIds)) {
      return NextResponse.json(
        { error: 'photoIds must be an array' },
        { status: 400 }
      )
    }

    if (photoIds.length === 0) {
      return NextResponse.json(
        { error: 'photoIds array cannot be empty' },
        { status: 400 }
      )
    }

    if (photoIds.length > 500) {
      return NextResponse.json(
        { error: 'Maximum 500 photos per export' },
        { status: 400 }
      )
    }

    // Validate all photoIds are valid UUIDs
    const invalidIds = photoIds.filter((id) => typeof id !== 'string' || !isValidUUID(id))
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: 'All photoIds must be valid UUIDs' },
        { status: 400 }
      )
    }

    // 4. Fetch photos with metadata
    const { data: photos, error: fetchError } = await getPhotosForExport(
      user.id,
      photoIds
    )

    if (fetchError) {
      console.error('Export fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch photos' },
        { status: 500 }
      )
    }

    if (!photos || photos.length === 0) {
      return NextResponse.json(
        { error: 'No photos found' },
        { status: 404 }
      )
    }

    // 5. Route based on count
    const photoCount = photos.length

    // MODE 1: Single photo - Direct download URL
    if (photoCount === 1) {
      const photo = photos[0]!
      const filename = generateExportFilename(photo, new Map())

      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from('photos')
        .createSignedUrl(photo.file_path, 3600, {
          download: filename, // Set Content-Disposition header with branded filename
        })

      if (urlError || !signedUrlData) {
        console.error('Failed to create signed URL:', urlError)
        return NextResponse.json(
          { error: 'Failed to generate download URL' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        downloadUrl: signedUrlData.signedUrl,
        filename,
      })
    }

    // MODE 2: 2-25 photos - Stream ZIP directly
    if (photoCount >= 2 && photoCount <= 25) {
      return streamZipResponse(photos, supabase)
    }

    // MODE 3: 26-500 photos - Background job
    if (photoCount >= 26 && photoCount <= 500) {
      try {
        const triggerResult = await tasks.trigger('export-photos', {
          userId: user.id,
          photoIds: photos.map((p) => p.id),
        })

        return NextResponse.json({
          jobId: triggerResult.id,
        })
      } catch (triggerError) {
        console.error('Failed to trigger export job:', triggerError)
        return NextResponse.json(
          { error: 'Failed to start export job' },
          { status: 500 }
        )
      }
    }

    // Should never reach here due to validation
    return NextResponse.json(
      { error: 'Invalid photo count' },
      { status: 400 }
    )
  } catch (err) {
    console.error('Export exception:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Stream a ZIP file directly to the client
 * Fetches photos in chunks of 5 for backpressure
 */
async function streamZipResponse(
  photos: PhotoForExport[],
  _supabase: Awaited<ReturnType<typeof createClient>>
) {
  const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss')
  const zipFilename = `TineSight_Export_${timestamp}.zip`

  // Create ZIP archive
  const archive = archiver('zip', {
    zlib: { level: 6 }, // Compression level (0-9)
  })

  // Track used filenames for collision handling
  const usedFilenames = new Map<string, number>()

  // Convert archive to Node.js readable stream
  const stream = Readable.from(archive)

  // Set up response headers
  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${zipFilename}"`,
  })

  // Handle archive errors
  archive.on('error', (err) => {
    console.error('Archive error:', err)
  })

  // Process photos in chunks of 5 for backpressure
  const CHUNK_SIZE = 5
  const chunks: PhotoForExport[][] = []
  for (let i = 0; i < photos.length; i += CHUNK_SIZE) {
    chunks.push(photos.slice(i, i + CHUNK_SIZE))
  }

  // Process chunks sequentially to avoid overwhelming storage API
  for (const chunk of chunks) {
    const downloadPromises = chunk.map(async (photo) => {
      try {
        const { data: buffer, error: downloadError } = await downloadPhotoBuffer(
          photo.file_path
        )

        if (downloadError || !buffer) {
          console.error(`Failed to download photo ${photo.id}:`, downloadError)
          return null // Skip failed downloads
        }

        const filename = generateExportFilename(photo, usedFilenames)
        return { filename, buffer }
      } catch (err) {
        console.error(`Exception downloading photo ${photo.id}:`, err)
        return null // Skip failed downloads
      }
    })

    const results = await Promise.all(downloadPromises)

    // Add successfully downloaded photos to archive
    for (const result of results) {
      if (result) {
        archive.append(Buffer.from(result.buffer), { name: result.filename })
      }
    }
  }

  // Finalize the archive (no more files will be added)
  archive.finalize()

  // Return streaming response
  return new NextResponse(stream as any, { headers })
}
