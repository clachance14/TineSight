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
export async function GET(request: NextRequest, { params }: RouteParams) {
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
      .select('file_path, user_id')
      .eq('id', detection.image_id)
      .single()

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    // Check ownership via image
    if (image.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get signed URL for the image
    const { data: signedUrl } = await supabase.storage
      .from('images')
      .createSignedUrl(image.file_path, 3600)

    return NextResponse.json({
      id: detection.id,
      imageId: detection.image_id,
      imageUrl: signedUrl?.signedUrl || null,
      bboxX: detection.bbox_x,
      bboxY: detection.bbox_y,
      bboxWidth: detection.bbox_width,
      bboxHeight: detection.bbox_height,
      sex: detection.sex,
      antlerPoints: detection.antler_points,
      ageClass: detection.age_class,
      species: detection.species,
      distinguishingFeatures: detection.distinguishing_features,
      confidence: detection.confidence,
      geminiConfidence: detection.gemini_confidence,
      deerId: detection.deer_id,
      createdAt: detection.created_at,
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
        details: validationResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      }, { status: 400 })
    }

    // Convert camelCase to snake_case for database
    const updateData = {
      sex: validationResult.data.sex,
      antler_points: validationResult.data.antlerPoints,
      age_class: validationResult.data.ageClass,
      species: validationResult.data.species,
      distinguishing_features: validationResult.data.distinguishingFeatures,
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
      antlerPoints: updated.antler_points,
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
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
