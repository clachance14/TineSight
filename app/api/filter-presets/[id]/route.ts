import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getFilterPreset,
  updateFilterPreset,
  deleteFilterPreset,
} from '@/lib/services/filter-presets'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/filter-presets/[id]
 * Get a single filter preset by ID
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: preset, error } = await getFilterPreset(user.id, id)

    if (error) {
      // Check if it's a "not found" error
      if (error.message.includes('No rows') || error.message.includes('not found')) {
        return NextResponse.json({ error: 'Filter preset not found' }, { status: 404 })
      }
      console.error('Error fetching filter preset:', error)
      return NextResponse.json({ error: 'Failed to fetch filter preset' }, { status: 500 })
    }

    if (!preset) {
      return NextResponse.json({ error: 'Filter preset not found' }, { status: 404 })
    }

    return NextResponse.json(preset)
  } catch (error) {
    console.error('GET filter-preset error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/filter-presets/[id]
 * Update filter preset
 * Body: { name?: string, filters?: Record<string, unknown>, is_default?: boolean }
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, filters, is_default } = body

    // Validate that at least one field is being updated
    if (name === undefined && filters === undefined && is_default === undefined) {
      return NextResponse.json(
        { error: 'At least one field (name, filters, or is_default) must be provided' },
        { status: 400 }
      )
    }

    // Validate field types if provided
    if (name !== undefined && typeof name !== 'string') {
      return NextResponse.json({ error: 'Name must be a string' }, { status: 400 })
    }

    if (filters !== undefined && (typeof filters !== 'object' || Array.isArray(filters))) {
      return NextResponse.json({ error: 'Filters must be an object' }, { status: 400 })
    }

    if (is_default !== undefined && typeof is_default !== 'boolean') {
      return NextResponse.json({ error: 'is_default must be a boolean' }, { status: 400 })
    }

    const updates: {
      name?: string
      filters?: Record<string, unknown>
      is_default?: boolean
    } = {}

    if (name !== undefined) updates.name = name
    if (filters !== undefined) updates.filters = filters
    if (is_default !== undefined) updates.is_default = is_default

    const { data: preset, error } = await updateFilterPreset(user.id, id, updates)

    if (error) {
      // Check for duplicate name error
      if (error.message.includes('already exists')) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      // Check for not found error
      if (error.message.includes('No rows') || error.message.includes('not found')) {
        return NextResponse.json({ error: 'Filter preset not found' }, { status: 404 })
      }
      console.error('Error updating filter preset:', error)
      return NextResponse.json({ error: 'Failed to update filter preset' }, { status: 500 })
    }

    if (!preset) {
      return NextResponse.json({ error: 'Filter preset not found' }, { status: 404 })
    }

    return NextResponse.json(preset)
  } catch (error) {
    console.error('PUT filter-preset error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/filter-presets/[id]
 * Delete filter preset
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await deleteFilterPreset(user.id, id)

    if (error) {
      console.error('Error deleting filter preset:', error)
      return NextResponse.json({ error: 'Failed to delete filter preset' }, { status: 500 })
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('DELETE filter-preset error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
