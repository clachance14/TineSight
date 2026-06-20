import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import type { Showcase, ShowcaseBuck } from '@/types/database'

/**
 * Showcase service (owner side). Public reads do NOT go through here — they use
 * the get_public_showcase RPC (ADR 0001). All functions are account-scoped via
 * RLS (auth.uid() = user_id) plus an explicit user_id filter.
 */

/** Unguessable share token: 24 random bytes, URL-safe (~32 chars). */
export function generateShowcaseToken(): string {
  return randomBytes(24).toString('base64url')
}

export interface ShowcaseWithBucks extends Showcase {
  bucks: ShowcaseBuck[]
}

/** List the current user's showcases (most recent first). */
export async function listShowcases(
  userId: string
): Promise<{ data: Showcase[] | null; error: Error | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('showcases')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return { data, error }
}

/** Create a showcase with an unguessable token and optionally seed it with bucks. */
export async function createShowcase(
  userId: string,
  input: { title?: string; deerIds?: string[] }
): Promise<{ data: Showcase | null; error: Error | null }> {
  const supabase = await createClient()

  const { data: showcase, error } = await supabase
    .from('showcases')
    .insert({
      user_id: userId,
      token: generateShowcaseToken(),
      title: input.title != null && input.title.trim() !== '' ? input.title.trim() : 'Trophy Showcase',
    })
    .select('*')
    .single()

  if (error !== null || showcase === null) {
    return { data: null, error: error ?? new Error('Failed to create showcase') }
  }

  if (input.deerIds && input.deerIds.length > 0) {
    const { error: bucksError } = await setShowcaseBucks(userId, showcase.id, input.deerIds)
    if (bucksError) {
      return { data: null, error: bucksError }
    }
  }

  return { data: showcase, error: null }
}

/**
 * Replace the curated bucks for a showcase, in the given order. The DB trigger
 * enforces that every deer belongs to the showcase owner; RLS enforces the
 * showcase belongs to the caller.
 */
export async function setShowcaseBucks(
  userId: string,
  showcaseId: string,
  deerIds: string[]
): Promise<{ error: Error | null }> {
  const supabase = await createClient()

  // Verify ownership of the showcase (defense in depth on top of RLS).
  const { data: owned } = await supabase
    .from('showcases')
    .select('id')
    .eq('id', showcaseId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!owned) {
    return { error: new Error('Showcase not found') }
  }

  const { error: delError } = await supabase
    .from('showcase_bucks')
    .delete()
    .eq('showcase_id', showcaseId)
  if (delError) {
    return { error: delError }
  }

  if (deerIds.length === 0) {
    return { error: null }
  }

  const rows = deerIds.map((deerId, index) => ({
    showcase_id: showcaseId,
    deer_id: deerId,
    position: index,
  }))
  const { error: insError } = await supabase.from('showcase_bucks').insert(rows)
  return { error: insError }
}

/** Revoke (deactivate) or re-activate a showcase. */
export async function setShowcaseActive(
  userId: string,
  showcaseId: string,
  isActive: boolean
): Promise<{ error: Error | null }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('showcases')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', showcaseId)
    .eq('user_id', userId)
  return { error }
}

/** Rotate the token (invalidates the old link immediately). */
export async function regenerateShowcaseToken(
  userId: string,
  showcaseId: string
): Promise<{ data: { token: string } | null; error: Error | null }> {
  const supabase = await createClient()
  const token = generateShowcaseToken()
  const { error } = await supabase
    .from('showcases')
    .update({ token, updated_at: new Date().toISOString() })
    .eq('id', showcaseId)
    .eq('user_id', userId)
  if (error) {
    return { data: null, error }
  }
  return { data: { token }, error: null }
}
