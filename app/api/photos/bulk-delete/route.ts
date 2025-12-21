import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deletePhotos } from '@/lib/services/photos'

export async function DELETE(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { photoIds } = body

    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json(
        { error: 'photoIds must be a non-empty array' },
        { status: 400 }
      )
    }

    if (photoIds.length > 500) {
      return NextResponse.json(
        { error: 'Maximum 500 photos per bulk operation' },
        { status: 400 }
      )
    }

    const { data, error } = await deletePhotos(user.id, photoIds)

    if (error) {
      console.error('Bulk delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Bulk delete exception:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
