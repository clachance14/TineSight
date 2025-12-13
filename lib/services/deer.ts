import { createClient } from '@/lib/supabase/server'

export interface Deer {
  id: string
  user_id: string
  name: string
  notes: string | null
  reference_detection_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateDeerData {
  name: string
  notes?: string | null
  detection_id: string  // Detection to use as reference
}

export interface UpdateDeerData {
  name?: string
  notes?: string | null
}

export interface DeerWithSightings extends Deer {
  sighting_count: number
  reference_image_url?: string | null
}

/**
 * Create a new deer profile from a detection
 */
export async function createDeer(
  userId: string,
  data: CreateDeerData
): Promise<{ data: Deer | null; error: Error | null }> {
  const supabase = await createClient()

  // Check for duplicate name
  const { data: existing } = await supabase
    .from('deer')
    .select('name')
    .eq('user_id', userId)
    .ilike('name', data.name)
    .maybeSingle()

  if (existing) {
    // Generate suggestion by appending number
    const { data: similar } = await supabase
      .from('deer')
      .select('name')
      .eq('user_id', userId)
      .ilike('name', `${data.name}%`)

    const count = similar?.length ?? 0
    const suggestion = `${data.name} (${count + 1})`

    return {
      data: null,
      error: new Error(`A deer named "${data.name}" already exists. Try "${suggestion}" instead.`),
    }
  }

  // Verify detection exists and get image_id for linking
  const { data: detection, error: detectionError } = await supabase
    .from('detections')
    .select('id, image_id')
    .eq('id', data.detection_id)
    .single()

  if (detectionError || !detection) {
    return { data: null, error: new Error('Detection not found') }
  }

  // Create deer profile
  const { data: deer, error: createError } = await supabase
    .from('deer')
    .insert({
      user_id: userId,
      name: data.name,
      notes: data.notes ?? null,
      reference_detection_id: data.detection_id,
    } as never)
    .select()
    .single()

  if (createError) {
    return { data: null, error: createError }
  }

  // Set detection as reference and link to deer
  await supabase
    .from('detections')
    .update({ is_reference: true, deer_id: deer.id } as never)
    .eq('id', data.detection_id)

  return { data: deer as unknown as Deer, error: null }
}

/**
 * Get all deer in user's catalog with sighting counts
 */
export async function getDeerCatalog(
  userId: string,
  search?: string
): Promise<{ data: DeerWithSightings[] | null; error: Error | null }> {
  const supabase = await createClient()

  let query = supabase
    .from('deer')
    .select(`
      *,
      detections:detections!deer_id(count)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    return { data: null, error }
  }

  // Transform to include sighting_count
  const deerWithCounts = (data ?? []).map((d: Record<string, unknown>) => ({
    ...d,
    sighting_count: Array.isArray(d['detections']) ? (d['detections'] as unknown[]).length : 0,
    detections: undefined,
  })) as unknown as DeerWithSightings[]

  return { data: deerWithCounts, error: null }
}

/**
 * Get a single deer profile by ID
 */
export async function getDeerById(
  userId: string,
  deerId: string
): Promise<{ data: DeerWithSightings | null; error: Error | null }> {
  const supabase = await createClient()

  const { data: deer, error } = await supabase
    .from('deer')
    .select('*')
    .eq('id', deerId)
    .eq('user_id', userId)
    .single()

  if (error) {
    return { data: null, error }
  }

  // Get sighting count
  const { count } = await supabase
    .from('detections')
    .select('*', { count: 'exact', head: true })
    .eq('deer_id', deerId)

  return {
    data: { ...(deer as unknown as Deer), sighting_count: count ?? 0 },
    error: null,
  }
}

/**
 * Update a deer profile
 */
export async function updateDeer(
  userId: string,
  deerId: string,
  data: UpdateDeerData
): Promise<{ data: Deer | null; error: Error | null }> {
  const supabase = await createClient()

  // Check for duplicate name if name is being changed
  if (data.name) {
    const { data: existing } = await supabase
      .from('deer')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', data.name)
      .neq('id', deerId)
      .maybeSingle()

    if (existing) {
      return {
        data: null,
        error: new Error(`A deer named "${data.name}" already exists.`),
      }
    }
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.name !== undefined) updateData['name'] = data.name
  if (data.notes !== undefined) updateData['notes'] = data.notes

  const { data: deer, error } = await supabase
    .from('deer')
    .update(updateData as never)
    .eq('id', deerId)
    .eq('user_id', userId)
    .select()
    .single()

  return { data: deer as unknown as Deer | null, error }
}

/**
 * Delete a deer profile (detections remain but become unassigned)
 */
export async function deleteDeer(
  userId: string,
  deerId: string
): Promise<{ error: Error | null }> {
  const supabase = await createClient()

  // Unlink detections first
  await supabase
    .from('detections')
    .update({ deer_id: null, is_reference: false } as never)
    .eq('deer_id', deerId)

  // Delete deer
  const { error } = await supabase
    .from('deer')
    .delete()
    .eq('id', deerId)
    .eq('user_id', userId)

  return { error }
}
