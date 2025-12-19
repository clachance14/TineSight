import { createClient } from '@/lib/supabase/server'

/**
 * NOTE: The filter_presets table is not yet in the generated database types.
 * Type assertions are used temporarily until the migration is applied and
 * types are regenerated with: npx supabase gen types typescript --linked > types/database.ts
 */

export interface FilterPreset {
  id: string
  user_id: string
  name: string
  filters: Record<string, unknown>
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface CreateFilterPresetData {
  name: string
  filters: Record<string, unknown>
  is_default?: boolean
}

export interface UpdateFilterPresetData {
  name?: string
  filters?: Record<string, unknown>
  is_default?: boolean
}

/**
 * Get all filter presets for a user
 */
export async function getFilterPresets(
  userId: string
): Promise<{
  data: FilterPreset[] | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await (supabase.from as any)('filter_presets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error !== null) {
    return { data: null, error }
  }

  return { data: data as FilterPreset[], error: null }
}

/**
 * Get a single filter preset by ID
 */
export async function getFilterPreset(
  userId: string,
  presetId: string
): Promise<{
  data: FilterPreset | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await (supabase.from as any)('filter_presets')
    .select('*')
    .eq('id', presetId)
    .eq('user_id', userId)
    .single()

  if (error !== null) {
    return { data: null, error }
  }

  return { data: data as FilterPreset, error: null }
}

/**
 * Get the default filter preset for a user
 */
export async function getDefaultFilterPreset(
  userId: string
): Promise<{
  data: FilterPreset | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await (supabase.from as any)('filter_presets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle()

  if (error !== null) {
    return { data: null, error }
  }

  return { data: data as FilterPreset | null, error: null }
}

/**
 * Create a new filter preset
 */
export async function createFilterPreset(
  userId: string,
  data: CreateFilterPresetData
): Promise<{
  data: FilterPreset | null
  error: Error | null
}> {
  const supabase = await createClient()

  // Check for duplicate name
  const { data: existing } = await (supabase.from as any)('filter_presets')
    .select('name')
    .eq('user_id', userId)
    .ilike('name', data.name)
    .maybeSingle()

  if (existing) {
    return {
      data: null,
      error: new Error(`A preset named "${data.name}" already exists. Please choose a different name.`),
    }
  }

  // If this preset should be default, unset any existing defaults first
  if (data.is_default === true) {
    await (supabase.from as any)('filter_presets')
      .update({ is_default: false } as never)
      .eq('user_id', userId)
      .eq('is_default', true)
  }

  const { data: preset, error } = await (supabase.from as any)('filter_presets')
    .insert({
      user_id: userId,
      name: data.name,
      filters: data.filters,
      is_default: data.is_default ?? false,
    } as never)
    .select()
    .single()

  if (error !== null) {
    return { data: null, error }
  }

  return { data: preset as FilterPreset, error: null }
}

/**
 * Update an existing filter preset
 */
export async function updateFilterPreset(
  userId: string,
  presetId: string,
  updates: UpdateFilterPresetData
): Promise<{
  data: FilterPreset | null
  error: Error | null
}> {
  const supabase = await createClient()

  // Check for duplicate name if name is being changed
  if (updates.name !== undefined) {
    const { data: existing } = await (supabase.from as any)('filter_presets')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', updates.name)
      .neq('id', presetId)
      .maybeSingle()

    if (existing) {
      return {
        data: null,
        error: new Error(`A preset named "${updates.name}" already exists. Please choose a different name.`),
      }
    }
  }

  // If setting this preset as default, unset any existing defaults first
  if (updates.is_default === true) {
    await (supabase.from as any)('filter_presets')
      .update({ is_default: false } as never)
      .eq('user_id', userId)
      .eq('is_default', true)
      .neq('id', presetId)
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (updates.name !== undefined) {
    updateData['name'] = updates.name
  }
  if (updates.filters !== undefined) {
    updateData['filters'] = updates.filters
  }
  if (updates.is_default !== undefined) {
    updateData['is_default'] = updates.is_default
  }

  const { data, error } = await (supabase.from as any)('filter_presets')
    .update(updateData as never)
    .eq('id', presetId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error !== null) {
    return { data: null, error }
  }

  return { data: data as FilterPreset, error: null }
}

/**
 * Delete a filter preset
 */
export async function deleteFilterPreset(
  userId: string,
  presetId: string
): Promise<{
  error: Error | null
}> {
  const supabase = await createClient()

  const { error } = await (supabase.from as any)('filter_presets')
    .delete()
    .eq('id', presetId)
    .eq('user_id', userId)

  return { error }
}

/**
 * Set a preset as default (unset any other defaults)
 */
export async function setDefaultPreset(
  userId: string,
  presetId: string
): Promise<{
  error: Error | null
}> {
  const supabase = await createClient()

  // First verify the preset exists and belongs to the user
  const { data: preset, error: fetchError } = await (supabase.from as any)('filter_presets')
    .select('id')
    .eq('id', presetId)
    .eq('user_id', userId)
    .single()

  if (fetchError !== null) {
    return { error: fetchError }
  }

  if (!preset) {
    return { error: new Error('Preset not found') }
  }

  // Unset any existing defaults
  const { error: unsetError } = await (supabase.from as any)('filter_presets')
    .update({ is_default: false } as never)
    .eq('user_id', userId)
    .eq('is_default', true)

  if (unsetError !== null) {
    return { error: unsetError }
  }

  // Set the new default
  const { error: setError } = await (supabase.from as any)('filter_presets')
    .update({ is_default: true } as never)
    .eq('id', presetId)
    .eq('user_id', userId)

  return { error: setError }
}
