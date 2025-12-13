import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/detections/[id]/regenerate-embedding
 * Trigger regeneration of the embedding from the ROI region
 *
 * NOTE: This feature is not yet implemented with the Gemini-based pipeline.
 * The previous Replicate-based embedding generation was removed.
 */
export async function POST(
  _request: NextRequest,
  _context: RouteContext
): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: 'Embedding regeneration is not yet implemented with the new Gemini-based pipeline',
      status: 'not_implemented'
    },
    { status: 501 }
  )
}
