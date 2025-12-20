import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFilterPresets, createFilterPreset } from '@/lib/services/filter-presets'

/**
 * GET /api/filter-presets
 * List all filter presets for authenticated user
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: presets, error } = await getFilterPresets(user.id)

    if (error) {
      console.error('Error fetching filter presets:', error)
      return NextResponse.json({ error: 'Failed to fetch filter presets' }, { status: 500 })
    }

    return NextResponse.json({ presets: presets || [] })
  } catch (error) {
    console.error('GET filter-presets error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/filter-presets
 * Create new filter preset
 * Body: { name: string, filters: Record<string, unknown>, is_default?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, filters, is_default } = body

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required and must be a string' }, { status: 400 })
    }

    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
      return NextResponse.json({ error: 'Filters is required and must be an object' }, { status: 400 })
    }

    // Validate optional fields
    if (is_default !== undefined && typeof is_default !== 'boolean') {
      return NextResponse.json({ error: 'is_default must be a boolean' }, { status: 400 })
    }

    const { data: preset, error } = await createFilterPreset(user.id, {
      name,
      filters,
      is_default,
    })

    if (error) {
      // Check for duplicate name error
      if (error.message.includes('already exists')) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      console.error('Error creating filter preset:', error)
      return NextResponse.json({ error: 'Failed to create filter preset' }, { status: 500 })
    }

    return NextResponse.json(preset, { status: 201 })
  } catch (error) {
    console.error('POST filter-presets error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
