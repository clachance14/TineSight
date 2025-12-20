import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonWithCache } from '@/lib/utils/cache-headers'

interface BatchStats {
  total_photos: number
  analyzed_photos: number
  photos_with_deer: number
  empty_photos: number
  failed_photos: number
  pending_photos: number
  processing_photos: number
  buck_count: number
  doe_count: number
  unknown_count: number
  size_class_breakdown: {
    trophy: number
    standard: number
    basket: number
    spike: number
    unknown: number
  }
}

interface RpcResult {
  total_photos: number
  analyzed_photos: number
  photos_with_deer: number
  empty_photos: number
  failed_photos: number
  pending_photos: number
  processing_photos: number
  buck_count: number
  doe_count: number
  unknown_count: number
  trophy_count: number
  standard_count: number
  basket_count: number
  spike_count: number
  unknown_size_count: number
}

/**
 * GET /api/photos/stats
 * Returns batch statistics for analyzed photos using optimized RPC
 */
export async function GET(request: NextRequest): Promise<NextResponse<BatchStats | { error: string }>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const batchId = searchParams.get('batch_id')

    // Single optimized RPC call replaces 3 sequential queries
    // Note: get_photo_stats RPC function exists in DB but not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('get_photo_stats', {
      p_user_id: user.id,
      p_batch_id: batchId ?? null,
    })

    if (error !== null) {
      console.error('Failed to get photo stats:', error)
      return NextResponse.json(
        { error: 'Failed to retrieve statistics' },
        { status: 500 }
      )
    }

    // RPC returns array with single row
    const result = (data as RpcResult[] | null)?.[0]

    if (result === undefined || result === null) {
      return jsonWithCache({
        total_photos: 0,
        analyzed_photos: 0,
        photos_with_deer: 0,
        empty_photos: 0,
        failed_photos: 0,
        pending_photos: 0,
        processing_photos: 0,
        buck_count: 0,
        doe_count: 0,
        unknown_count: 0,
        size_class_breakdown: {
          trophy: 0,
          standard: 0,
          basket: 0,
          spike: 0,
          unknown: 0,
        },
      }, 'private-medium', { status: 200 })
    }

    const stats: BatchStats = {
      total_photos: result.total_photos,
      analyzed_photos: result.analyzed_photos,
      photos_with_deer: result.photos_with_deer,
      empty_photos: result.empty_photos,
      failed_photos: result.failed_photos,
      pending_photos: result.pending_photos,
      processing_photos: result.processing_photos,
      buck_count: result.buck_count,
      doe_count: result.doe_count,
      unknown_count: result.unknown_count,
      size_class_breakdown: {
        trophy: result.trophy_count,
        standard: result.standard_count,
        basket: result.basket_count,
        spike: result.spike_count,
        unknown: result.unknown_size_count,
      },
    }

    return jsonWithCache(stats, 'private-medium', { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/photos/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
