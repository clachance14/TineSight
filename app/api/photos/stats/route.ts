import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface BatchStats {
  total_photos: number
  analyzed_photos: number
  photos_with_deer: number
  empty_photos: number
  failed_photos: number
  buck_count: number
  doe_count: number
  unknown_count: number
  points_breakdown: {
    ten_plus: number
    eight_nine: number
    six_seven: number
    under_six: number
  }
}

/**
 * GET /api/photos/stats
 * Returns batch statistics for analyzed photos
 */
export async function GET(request: NextRequest): Promise<NextResponse<BatchStats | { error: string }>> {
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

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const batchId = searchParams.get('batch_id')

    // Build base query for images
    let imagesQuery = supabase
      .from('images')
      .select('detection_status, has_deer', { count: 'exact' })
      .eq('user_id', user.id)

    if (batchId !== null) {
      imagesQuery = imagesQuery.eq('batch_id', batchId)
    }

    // Get all images to calculate stats
    const { data: images, error: imagesError, count: totalPhotos } = await imagesQuery

    if (imagesError !== null) {
      console.error('Failed to get images:', imagesError)
      return NextResponse.json(
        { error: 'Failed to retrieve statistics' },
        { status: 500 }
      )
    }

    // Calculate image-level statistics
    const analyzedPhotos = images?.filter(img => img.detection_status === 'completed').length ?? 0
    const photosWithDeer = images?.filter(img => img.has_deer === true).length ?? 0
    const emptyPhotos = images?.filter(img => img.has_deer === false && img.detection_status === 'completed').length ?? 0
    const failedPhotos = images?.filter(img => img.detection_status === 'failed').length ?? 0

    // Get image IDs to query detections
    let imageIdsQuery = supabase
      .from('images')
      .select('id')
      .eq('user_id', user.id)

    if (batchId !== null) {
      imageIdsQuery = imageIdsQuery.eq('batch_id', batchId)
    }

    const { data: imageIds, error: imageIdsError } = await imageIdsQuery

    if (imageIdsError !== null) {
      console.error('Failed to get image IDs:', imageIdsError)
      return NextResponse.json(
        { error: 'Failed to retrieve statistics' },
        { status: 500 }
      )
    }

    // If no images, return zeros
    if (imageIds === null || imageIds.length === 0) {
      return NextResponse.json({
        total_photos: 0,
        analyzed_photos: 0,
        photos_with_deer: 0,
        empty_photos: 0,
        failed_photos: 0,
        buck_count: 0,
        doe_count: 0,
        unknown_count: 0,
        points_breakdown: {
          ten_plus: 0,
          eight_nine: 0,
          six_seven: 0,
          under_six: 0,
        },
      }, { status: 200 })
    }

    // Query detections for the filtered images
    const imageIdList = imageIds.map(img => img.id)
    const { data: detections, error: detectionsError } = await supabase
      .from('detections')
      .select('sex, antler_points')
      .in('image_id', imageIdList)

    if (detectionsError !== null) {
      console.error('Failed to get detections:', detectionsError)
      return NextResponse.json(
        { error: 'Failed to retrieve statistics' },
        { status: 500 }
      )
    }

    // Calculate detection-level statistics
    const buckCount = detections?.filter(d => d.sex === 'buck').length ?? 0
    const doeCount = detections?.filter(d => d.sex === 'doe').length ?? 0
    const unknownCount = detections?.filter(d => d.sex === 'unknown' || d.sex === 'fawn' || d.sex === null).length ?? 0

    // Calculate points breakdown (only for bucks)
    const bucks = detections?.filter(d => d.sex === 'buck' && d.antler_points !== null) ?? []
    const tenPlus = bucks.filter(b => (b.antler_points ?? 0) >= 10).length
    const eightNine = bucks.filter(b => (b.antler_points ?? 0) >= 8 && (b.antler_points ?? 0) <= 9).length
    const sixSeven = bucks.filter(b => (b.antler_points ?? 0) >= 6 && (b.antler_points ?? 0) <= 7).length
    const underSix = bucks.filter(b => (b.antler_points ?? 0) < 6).length

    // Build response
    const stats: BatchStats = {
      total_photos: totalPhotos ?? 0,
      analyzed_photos: analyzedPhotos,
      photos_with_deer: photosWithDeer,
      empty_photos: emptyPhotos,
      failed_photos: failedPhotos,
      buck_count: buckCount,
      doe_count: doeCount,
      unknown_count: unknownCount,
      points_breakdown: {
        ten_plus: tenPlus,
        eight_nine: eightNine,
        six_seven: sixSeven,
        under_six: underSix,
      },
    }

    return NextResponse.json(stats, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/photos/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
