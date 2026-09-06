import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Constants
const MAX_FILES_PER_REQUEST = 1000

// Request types
interface FileCheck {
  filename: string
  size: number
  contentSha256?: string
}

interface CheckDuplicatesRequest {
  files: FileCheck[]
}

// Response types
interface CheckDuplicatesResponse {
  existing: string[]
  existingHashes: string[]
  existingKeys: string[]
  toUpload: string[]
  totalChecked: number
  duplicateCount: number
}

/**
 * POST /api/photos/check-duplicates
 * Checks if files already exist in the user's library by filename + size.
 * Used to skip duplicates when re-uploading after page refresh.
 */
export async function POST(request: NextRequest): Promise<NextResponse<{ error: string; }> | NextResponse<CheckDuplicatesResponse>> {
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
    let body: CheckDuplicatesRequest | null
    try {
      body = await request.json() as CheckDuplicatesRequest | null
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    // Validate files array
    if (body === null || !Array.isArray(body.files) || body.files.length === 0) {
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

      if ((file.filename === "") || typeof file.filename !== 'string') {
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

    const hashes = [...new Set(body.files.map(file => file.contentSha256).filter((hash): hash is string => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash)))]
    let existingHashes: string[] = []
    if (hashes.length > 0) {
      const { data, error } = await supabase.rpc('get_uploaded_content_hashes', { p_hashes: hashes })
      if (error) return NextResponse.json({ error: 'Failed to check duplicates' }, { status: 500 })
      existingHashes = data as unknown as string[]
    }
    const existingSet = new Set(existingHashes)

    // Categorize files
    const existingKeys: string[] = []
    const existing: string[] = []
    const toUpload: string[] = []

    for (const file of body.files) {
      if ((file.contentSha256 != null) && existingSet.has(file.contentSha256)) {
        existing.push(file.filename)
        existingKeys.push(JSON.stringify([file.filename, file.size]))
      } else {
        toUpload.push(file.filename)
      }
    }

    const response: CheckDuplicatesResponse = {
      existing,
      existingKeys,
      existingHashes,
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
