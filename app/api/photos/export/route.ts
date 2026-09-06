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
import { createArchiveFile } from '@/lib/export/archive-file'
import { ExportSizeError } from '@/lib/export/limits'

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

  if (lastExport !== undefined && now - lastExport < RATE_LIMIT_WINDOW_MS) {
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
export async function POST(request: Request): Promise<Response> {
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
    const body: unknown = await request.json()
    const photoIds: unknown = typeof body === 'object' && body !== null && 'photoIds' in body ? body.photoIds : undefined

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
      photoIds as string[]
    )

    if (fetchError) {
      if (fetchError instanceof ExportSizeError) return NextResponse.json({ error: fetchError.message }, { status: 413 })
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
      const photo = photos[0]
      if (!photo) throw new Error('No photo found')
      const filename = generateExportFilename(photo, new Map())

      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from('photos')
        .createSignedUrl(photo.file_path, 3600, {
          download: filename, // Set Content-Disposition header with branded filename
        })

      if (urlError) {
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
      return await streamZipResponse(photos, supabase)
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

/** Build a bounded ZIP before returning headers so missing files cannot become a successful partial export. */
async function streamZipResponse(
  photos: PhotoForExport[],
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Response> {
  const zipFilename = `TineSight_Export_${format(new Date(), 'yyyy-MM-dd-HHmmss')}.zip`
  const file = await createArchiveFile(archiver('zip', { zlib: { level: 6 } }))
  const usedFilenames = new Map<string, number>()
  try {
    for (const photo of photos) {
      const { data: buffer, error } = await downloadPhotoBuffer(photo.file_path, supabase)
      if (error || !buffer) throw new Error('Failed to download a selected photo. Please retry the export.')
      await file.append(Buffer.from(buffer), generateExportFilename(photo, usedFilenames))
    }
    const { stream } = await file.finish()
    const iterator = stream[Symbol.asyncIterator]()
    const body = new ReadableStream<Uint8Array>({
      async pull(controller): Promise<void> {
        try {
          const chunk = await iterator.next()
          if (chunk.done === true) { await file.cleanup(); controller.close() }
          else controller.enqueue(chunk.value as Uint8Array)
        } catch (error) { await file.cleanup(); controller.error(error) }
      },
      async cancel(): Promise<void> { await file.cleanup() },
    })
    return new NextResponse(body, { headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"`,
    } })
  } catch (error) {
    await file.cleanup()
    if (error instanceof ExportSizeError) return NextResponse.json({ error: error.message }, { status: 413 })
    throw error
  }
}
