import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

export async function getProfile(userId: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  return { data: data as Profile | null, error }
}

export async function updateProfile(userId: string, updates: Partial<Omit<Profile, 'id' | 'created_at'>>) {
  const supabase = createClient()

  // Build update object with only defined fields to satisfy exactOptionalPropertyTypes
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }

  if (updates.email !== undefined) updateData['email'] = updates.email
  if (updates.full_name !== undefined) updateData['full_name'] = updates.full_name
  if (updates.avatar_url !== undefined) updateData['avatar_url'] = updates.avatar_url
  if (updates.subscription_tier !== undefined) updateData['subscription_tier'] = updates.subscription_tier
  if (updates.stripe_customer_id !== undefined) updateData['stripe_customer_id'] = updates.stripe_customer_id

  const { data, error } = await supabase
    .from('profiles')
    .update(updateData as never)
    .eq('id', userId)
    .select()
    .single()

  return { data: data as Profile | null, error }
}
