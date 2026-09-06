import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectionUpdateSchema } from '@/lib/validations/detection'
import { getDetection, updateDetection, softDeleteDetection } from '@/lib/services/detections'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/detections/[id]
 * Get a single detection with image URL for display in edit panel
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get detection with image info
    const { data: detection, error } = await getDetection(id)

    if (error) {
      console.error('Error fetching detection:', error)
      return NextResponse.json({ error: 'Failed to fetch detection' }, { status: 500 })
    }

    if (!detection) {
      return NextResponse.json({ error: 'Detection not found' }, { status: 404 })
    }

    // Get image URL for the detection thumbnail
    const { data: image } = await supabase
      .from('images')
      .select('file_path, medium_path, thumbnail_path, user_id, captured_at')
      .eq('id', detection.image_id)
      .single()

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    // Check ownership via image
    if (image.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get signed URLs for image and crop in parallel
    const previewPath = image.medium_path !== null && image.medium_path !== '' ? image.medium_path : image.thumbnail_path
    const [imageUrlResult, cropUrlResult, profileResult, previewUrlResult] = await Promise.all([
      supabase.storage.from('photos').createSignedUrl(image.file_path, 3600),
      detection.crop_file_path
        ? supabase.storage.from('photos').createSignedUrl(detection.crop_file_path, 3600)
        : Promise.resolve({ data: null }),
      supabase.from('profiles').select('trophy_threshold').eq('id', user.id).single(),
      previewPath !== null && previewPath !== '' ? supabase.storage.from('photos').createSignedUrl(previewPath, 3600) : Promise.resolve({ data: null }),
    ])

    const signedUrl = imageUrlResult.data
    const cropUrl = cropUrlResult.data?.signedUrl || null

    return NextResponse.json({
      id: detection.id,
      imageId: detection.image_id,
      imageUrl: signedUrl?.signedUrl || null,
      cropUrl,
      previewUrl: previewUrlResult.data?.signedUrl ?? null,
      bboxX: detection.bbox_x,
      bboxY: detection.bbox_y,
      bboxWidth: detection.bbox_width,
      bboxHeight: detection.bbox_height,
      sex: detection.sex,
      sizeClass: detection.size_class,
      estimatedPointRange: detection.estimated_point_range,
      ageClass: detection.age_class,
      species: detection.species,
      distinguishingFeatures: detection.distinguishing_features,
      confidence: detection.confidence,
      geminiConfidence: detection.gemini_confidence,
      deerId: detection.deer_id,
      createdAt: detection.created_at,
      antlerFingerprint: detection.antler_fingerprint,
      scoreEstimate: detection.score_estimate,
      scoreEstimateConfidence: detection.score_estimate_confidence,
      trophyThreshold: profileResult.error ? null : profileResult.data?.trophy_threshold ?? null,
      capturedAt: image.captured_at,
      deerName: detection.deer?.name ?? null,
    })
  } catch (error) {
    console.error('GET detection error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/detections/[id]
 * Update detection classification fields (Owner only)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get detection to verify ownership
    const { data: detection, error: fetchError } = await getDetection(id)

    if (fetchError || !detection) {
      return NextResponse.json({ error: 'Detection not found' }, { status: 404 })
    }

    // Get image to check ownership
    const { data: image } = await supabase
      .from('images')
      .select('user_id')
      .eq('id', detection.image_id)
      .single()

    if (!image || image.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden - Owner role required' }, { status: 403 })
    }

    // Parse and validate request body
    const body = await request.json()
    const validationResult = detectionUpdateSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json({
        error: 'Validation failed',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: validationResult.error.issues.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      }, { status: 400 })
    }

    // If deer_id is being updated, verify the deer belongs to the same user
    if (validationResult.data.deerId !== undefined && validationResult.data.deerId !== null) {
      const { data: deer } = await supabase
        .from('deer')
        .select('user_id')
        .eq('id', validationResult.data.deerId)
        .single()

      if (!deer) {
        return NextResponse.json({ error: 'Deer profile not found' }, { status: 404 })
      }

      if (deer.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden - Cannot link to deer profile owned by another user' }, { status: 403 })
      }
    }

    // Convert camelCase to snake_case for database
    const updateData = {
      sex: validationResult.data.sex,
      size_class: validationResult.data.sizeClass,
      estimated_point_range: validationResult.data.estimatedPointRange,
      age_class: validationResult.data.ageClass,
      species: validationResult.data.species,
      distinguishing_features: validationResult.data.distinguishingFeatures,
      deer_id: validationResult.data.deerId,
    }

    // Remove undefined values
    const filteredData = Object.fromEntries(
      Object.entries(updateData).filter(([, v]) => v !== undefined)
    )

    const { data: updated, error: updateError } = await updateDetection(id, filteredData)

    if (updateError) {
      console.error('Error updating detection:', updateError)
      return NextResponse.json({ error: 'Failed to update detection' }, { status: 500 })
    }

    if (!updated) {
      return NextResponse.json({ error: 'Detection not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: updated.id,
      imageId: updated.image_id,
      sex: updated.sex,
      sizeClass: updated.size_class,
      estimatedPointRange: updated.estimated_point_range,
      ageClass: updated.age_class,
      species: updated.species,
      distinguishingFeatures: updated.distinguishing_features,
      confidence: updated.confidence,
      geminiConfidence: updated.gemini_confidence,
      deerId: updated.deer_id,
      createdAt: updated.created_at,
    })
  } catch (error) {
    console.error('PATCH detection error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/detections/[id]
 * Soft-delete a detection (Owner only)
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get detection to verify ownership
    const { data: detection, error: fetchError } = await getDetection(id)

    if (fetchError || !detection) {
      return NextResponse.json({ error: 'Detection not found or already deleted' }, { status: 404 })
    }

    // Get image to check ownership
    const { data: image } = await supabase
      .from('images')
      .select('user_id')
      .eq('id', detection.image_id)
      .single()

    if (!image || image.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden - Owner role required' }, { status: 403 })
    }

    // Perform soft delete
    const { data: result, error: deleteError } = await softDeleteDetection(id)

    if (deleteError) {
      console.error('Error deleting detection:', deleteError)
      return NextResponse.json({ error: 'Failed to delete detection' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deletedAt: result?.deletedAt,
    })
  } catch (error) {
    console.error('DELETE detection error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
