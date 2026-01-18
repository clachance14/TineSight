import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Constants
const MAX_FILES_PER_REQUEST = 1000

// Request types
interface FileCheck {
  filename: string
  size: number
}

interface CheckDuplicatesRequest {
  files: FileCheck[]
}

// Response types
interface CheckDuplicatesResponse {
  existing: string[]
  toUpload: string[]
  totalChecked: number
  duplicateCount: number
}

/**
 * POST /api/photos/check-duplicates
 * Checks if files already exist in the user's library by filename + size.
 * Used to skip duplicates when re-uploading after page refresh.
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    let body: CheckDuplicatesRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    // Validate files array
    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      return NextResponse.json(
        { error: 'files array is required and must not be empty' },
        { status: 400 }
      )
    }

    if (body.files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES_PER_REQUEST} files per request` },
        { status: 400 }
      )
    }

    // Validate each file entry
    const validationErrors: string[] = []
    for (let i = 0; i < body.files.length; i++) {
      const file = body.files[i]

      if (!file) {
        validationErrors.push(`File ${i}: missing file object`)
        continue
      }

      if (!file.filename || typeof file.filename !== 'string') {
        validationErrors.push(`File ${i}: filename is required`)
      } else if (file.filename.length > 255) {
        validationErrors.push(`File ${i}: filename exceeds 255 characters`)
      }

      if (typeof file.size !== 'number' || file.size <= 0) {
        validationErrors.push(`File ${i}: size must be a positive number`)
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // Extract unique sizes for efficient querying
    const sizes = body.files.map((f) => f.size)

    // Query for existing images by filename (file_path ends with filename)
    // We need to check both original filename match and file size
    // Note: file_path format is "user_id/batch_id/filename"
    // We extract the filename from file_path for comparison

    // First, get all images that might match by size
    const { data: existingImages, error: queryError } = await supabase
      .from('images')
      .select('file_path, file_size_bytes')
      .eq('user_id', user.id)
      .in('file_size_bytes', [...new Set(sizes)])

    if (queryError !== null) {
      console.error('Failed to query existing images:', queryError)
      return NextResponse.json(
        { error: 'Failed to check duplicates' },
        { status: 500 }
      )
    }

    // Build a set of existing "filename|size" combinations for fast lookup
    const existingSet = new Set<string>()
    if (existingImages) {
      for (const img of existingImages) {
        // Extract filename from file_path (last segment after /)
        const pathParts = img.file_path.split('/')
        const storedFilename = pathParts[pathParts.length - 1]
        if (storedFilename && img.file_size_bytes !== null) {
          existingSet.add(`${storedFilename}|${img.file_size_bytes}`)
        }
      }
    }

    // Categorize files
    const existing: string[] = []
    const toUpload: string[] = []

    for (const file of body.files) {
      const key = `${file.filename}|${file.size}`
      if (existingSet.has(key)) {
        existing.push(file.filename)
      } else {
        toUpload.push(file.filename)
      }
    }

    const response: CheckDuplicatesResponse = {
      existing,
      toUpload,
      totalChecked: body.files.length,
      duplicateCount: existing.length,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in check-duplicates endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
