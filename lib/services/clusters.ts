/**
 * Cluster Service
 * Feature: 011-trophy-fingerprint
 *
 * CRUD operations for trophy clusters.
 * Handles clustering, merging, splitting, and naming of trophy detection groups.
 */

import { createClient } from '@/lib/supabase/server'
import type { TrophyCluster } from '@/types/fingerprint'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface ClusterWithMembers extends TrophyCluster {
  members: {
    id: string
    detection_id: string
    similarity_to_representative: number | null
    detection: {
      id: string
      image_id: string
      crop_file_path: string
      antler_fingerprint: unknown
      estimated_point_range: string | null
    }
    image: {
      captured_at: string
    }
  }[]
  representative_detection: {
    crop_file_path: string
  } | null
}

export interface CreateClusterData {
  userId: string
  detectionIds: string[]
  representativeDetectionId: string
  avgSimilarity?: number
  minSimilarity?: number
}

/**
 * Get all pending clusters for a user
 */
export async function getPendingClusters(
  userId: string
): Promise<{ data: ClusterWithMembers[] | null; error: Error | null }> {
  const supabase = await createClient()

  const { data: clusters, error } = await supabase
    .from('trophy_clusters')
    .select(
      `
      id,
      user_id,
      representative_detection_id,
      status,
      created_deer_id,
      member_count,
      avg_similarity,
      min_similarity,
      created_at,
      updated_at,
      representative_detection:detections!representative_detection_id(crop_file_path),
      members:trophy_cluster_members(
        id,
        detection_id,
        similarity_to_representative,
        detection:detections!detection_id(
          id,
          image_id,
          crop_file_path,
          antler_fingerprint,
          estimated_point_range
        )
      )
    `
    )
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    return { data: null, error: new Error(error.message) }
  }

  // Fetch captured_at from images for each member detection
  const clustersWithImages = await Promise.all(
    (clusters || []).map(async (cluster) => {
      const membersWithImages = await Promise.all(
        (cluster.members || []).map(async (member) => {
          const { data: image } = await supabase
            .from('images')
            .select('captured_at')
            .eq('id', member.detection.image_id)
            .single()

          return {
            ...member,
            image: {
              captured_at: image?.captured_at || new Date().toISOString(),
            },
          }
        })
      )

      return {
        ...cluster,
        members: membersWithImages,
      } as ClusterWithMembers
    })
  )

  return { data: clustersWithImages, error: null }
}

/**
 * Get a specific cluster by ID
 */
export async function getClusterById(
  clusterId: string
): Promise<{ data: ClusterWithMembers | null; error: Error | null }> {
  const supabase = await createClient()

  const { data: cluster, error } = await supabase
    .from('trophy_clusters')
    .select(
      `
      id,
      user_id,
      representative_detection_id,
      status,
      created_deer_id,
      member_count,
      avg_similarity,
      min_similarity,
      created_at,
      updated_at,
      representative_detection:detections!representative_detection_id(crop_file_path),
      members:trophy_cluster_members(
        id,
        detection_id,
        similarity_to_representative,
        detection:detections!detection_id(
          id,
          image_id,
          crop_file_path,
          antler_fingerprint,
          estimated_point_range
        )
      )
    `
    )
    .eq('id', clusterId)
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }

  // Fetch captured_at from images for each member detection
  const membersWithImages = await Promise.all(
    (cluster.members || []).map(async (member) => {
      const { data: image } = await supabase
        .from('images')
        .select('captured_at')
        .eq('id', member.detection.image_id)
        .single()

      return {
        ...member,
        image: {
          captured_at: image?.captured_at || new Date().toISOString(),
        },
      }
    })
  )

  const clusterWithImages = {
    ...cluster,
    members: membersWithImages,
  } as ClusterWithMembers

  return { data: clusterWithImages, error: null }
}

/**
 * Create a new cluster
 * Used by the clustering job
 */
export async function createCluster(
  data: CreateClusterData,
  supabaseClient?: SupabaseClient<Database>
): Promise<{ data: TrophyCluster | null; error: Error | null }> {
  const supabase = supabaseClient || (await createClient())

  // Create cluster record
  const { data: cluster, error: clusterError } = await supabase
    .from('trophy_clusters')
    .insert({
      user_id: data.userId,
      representative_detection_id: data.representativeDetectionId,
      status: 'pending',
      member_count: data.detectionIds.length,
      avg_similarity: data.avgSimilarity ?? null,
      min_similarity: data.minSimilarity ?? null,
    } as never)
    .select()
    .single()

  if (clusterError || !cluster) {
    return { data: null, error: new Error(clusterError?.message || 'Failed to create cluster') }
  }

  // Create cluster member records
  const members = data.detectionIds.map((detectionId) => ({
    cluster_id: cluster.id,
    detection_id: detectionId,
    similarity_to_representative:
      detectionId === data.representativeDetectionId ? 1.0 : null,
  }))

  const { error: membersError } = await supabase
    .from('trophy_cluster_members')
    .insert(members as never)

  if (membersError) {
    // Rollback cluster creation
    await supabase.from('trophy_clusters').delete().eq('id', cluster.id)
    return { data: null, error: new Error(membersError.message) }
  }

  return { data: cluster as TrophyCluster, error: null }
}

/**
 * Merge a cluster into another cluster
 * Moves all members from source cluster to target cluster
 */
export async function mergeCluster(
  clusterId: string,
  targetClusterId: string
): Promise<{ data: boolean; error: Error | null }> {
  const supabase = await createClient()
  if (clusterId === targetClusterId) return { data: false, error: new Error('Choose a different candidate group') }

  // Verify both clusters exist and belong to same user
  const { data: sourceCluster } = await supabase
    .from('trophy_clusters')
    .select('user_id, status')
    .eq('id', clusterId)
    .single()

  const { data: targetCluster } = await supabase
    .from('trophy_clusters')
    .select('user_id, status')
    .eq('id', targetClusterId)
    .single()

  if (!sourceCluster || !targetCluster) {
    return { data: false, error: new Error('Cluster not found') }
  }

  if (sourceCluster.user_id !== targetCluster.user_id) {
    return { data: false, error: new Error('Clusters belong to different users') }
  }

  if (sourceCluster.status !== 'pending' || targetCluster.status !== 'pending') {
    return { data: false, error: new Error('Can only merge pending clusters') }
  }

  // Get all members from source cluster
  const { data: members } = await supabase
    .from('trophy_cluster_members')
    .select('detection_id, similarity_to_representative')
    .eq('cluster_id', clusterId)

  if (!members || members.length === 0) {
    return { data: false, error: new Error('Source cluster has no members') }
  }

  // Update members to point to target cluster
  const { error: updateError } = await supabase
    .from('trophy_cluster_members')
    .update({ cluster_id: targetClusterId } as never)
    .eq('cluster_id', clusterId)

  if (updateError) {
    return { data: false, error: new Error(updateError.message) }
  }

  // Update target cluster member count
  const { count: newMemberCount, error: countError } = await supabase
    .from('trophy_cluster_members')
    .select('id', { count: 'exact', head: true })
    .eq('cluster_id', targetClusterId)

  if (countError) return { data: false, error: new Error(countError.message) }
  const { error: targetError } = await supabase
    .from('trophy_clusters')
    .update({
      member_count: newMemberCount ?? 0,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', targetClusterId)
  if (targetError) return { data: false, error: new Error(targetError.message) }

  // Mark source cluster as merged
  const { error: mergeError } = await supabase
    .from('trophy_clusters')
    .update({
      status: 'merged',
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', clusterId)

  if (mergeError) {
    return { data: false, error: new Error(mergeError.message) }
  }

  return { data: true, error: null }
}

/**
 * Split detections from a cluster into a new cluster
 */
export async function splitCluster(
  clusterId: string,
  detectionIds: string[]
): Promise<{ data: TrophyCluster | null; error: Error | null }> {
  const supabase = await createClient()

  // Get original cluster
  const { data: originalCluster } = await supabase
    .from('trophy_clusters')
    .select('user_id, status')
    .eq('id', clusterId)
    .single()

  if (!originalCluster) {
    return { data: null, error: new Error('Cluster not found') }
  }

  if (originalCluster.status !== 'pending') {
    return { data: null, error: new Error('Can only split pending clusters') }
  }

  // Verify detections belong to this cluster
  const { data: members } = await supabase
    .from('trophy_cluster_members')
    .select('detection_id')
    .eq('cluster_id', clusterId)
    .in('detection_id', detectionIds)

  if (!members || members.length !== detectionIds.length) {
    return { data: null, error: new Error('Some detections do not belong to this cluster') }
  }

  // Create new cluster
  const { data: newCluster, error: createError } = await supabase
    .from('trophy_clusters')
    .insert({
      user_id: originalCluster.user_id,
      representative_detection_id: detectionIds[0],
      status: 'pending',
      member_count: detectionIds.length,
    } as never)
    .select()
    .single()

  if (createError || !newCluster) {
    return { data: null, error: new Error(createError?.message || 'Failed to create new cluster') }
  }

  // Move detections to new cluster
  const { error: updateError } = await supabase
    .from('trophy_cluster_members')
    .update({ cluster_id: newCluster.id } as never)
    .in('detection_id', detectionIds)

  if (updateError) {
    // Rollback
    await supabase.from('trophy_clusters').delete().eq('id', newCluster.id)
    return { data: null, error: new Error(updateError.message) }
  }

  // Update original cluster member count
  const { count: remainingCount, error: countError } = await supabase
    .from('trophy_cluster_members')
    .select('id', { count: 'exact', head: true })
    .eq('cluster_id', clusterId)

  if (countError) return { data: null, error: new Error(countError.message) }
  const { data: remaining, error: representativeError } = await supabase
    .from('trophy_cluster_members')
    .select('detection_id')
    .eq('cluster_id', clusterId)
    .order('id')
    .limit(1)
  if (representativeError) return { data: null, error: new Error(representativeError.message) }

  const { error: sourceError } = await supabase
    .from('trophy_clusters')
    .update({
      member_count: remainingCount ?? 0,
      status: (remainingCount ?? 0) > 0 ? 'pending' : 'split',
      representative_detection_id: remaining?.[0]?.detection_id ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', clusterId)
  if (sourceError) return { data: null, error: new Error(sourceError.message) }

  return { data: newCluster as TrophyCluster, error: null }
}

/**
 * Dismiss a cluster
 * Marks cluster as dismissed and removes all members
 */
export async function dismissCluster(
  clusterId: string
): Promise<{ data: boolean; error: Error | null }> {
  const supabase = await createClient()

  // Verify cluster exists and is pending
  const { data: cluster } = await supabase
    .from('trophy_clusters')
    .select('status')
    .eq('id', clusterId)
    .single()

  if (!cluster) {
    return { data: false, error: new Error('Cluster not found') }
  }

  if (cluster.status !== 'pending') {
    return { data: false, error: new Error('Can only dismiss pending clusters') }
  }

  // Delete all cluster members (cascade will handle this via DB, but being explicit)
  const { error: deleteMembersError } = await supabase
    .from('trophy_cluster_members')
    .delete()
    .eq('cluster_id', clusterId)

  if (deleteMembersError) {
    return { data: false, error: new Error(deleteMembersError.message) }
  }

  // Mark cluster as dismissed
  const { error: dismissError } = await supabase
    .from('trophy_clusters')
    .update({
      status: 'dismissed',
      member_count: 0,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', clusterId)

  if (dismissError) {
    return { data: false, error: new Error(dismissError.message) }
  }

  return { data: true, error: null }
}

/**
 * Name a cluster - creates a deer profile and links all detections
 */
export async function nameCluster(
  clusterId: string,
  name: string,
  notes?: string
): Promise<{ data: { deer_id: string; linked_count: number } | null; error: Error | null }> {
  const supabase = await createClient()

  // Get cluster and verify it's pending
  const { data: cluster } = await supabase
    .from('trophy_clusters')
    .select('user_id, representative_detection_id, status')
    .eq('id', clusterId)
    .single()

  if (!cluster) {
    return { data: null, error: new Error('Cluster not found') }
  }

  if (cluster.status !== 'pending') {
    return { data: null, error: new Error('Can only name pending clusters') }
  }

  if (!cluster.representative_detection_id) {
    return { data: null, error: new Error('Cluster has no representative detection') }
  }

  // Check for duplicate deer name
  const { data: existing } = await supabase
    .from('deer')
    .select('name')
    .eq('user_id', cluster.user_id)
    .ilike('name', name)
    .maybeSingle()

  if (existing) {
    return { data: null, error: new Error(`A deer named "${name}" already exists`) }
  }

  // Create deer profile
  const { data: deer, error: createDeerError } = await supabase
    .from('deer')
    .insert({
      user_id: cluster.user_id,
      name,
      notes: notes ?? null,
      reference_detection_id: cluster.representative_detection_id,
    } as never)
    .select()
    .single()

  if (createDeerError || !deer) {
    return { data: null, error: new Error(createDeerError?.message || 'Failed to create deer') }
  }

  // Get all member detection IDs
  const { data: members } = await supabase
    .from('trophy_cluster_members')
    .select('detection_id')
    .eq('cluster_id', clusterId)

  if (!members || members.length === 0) {
    return { data: null, error: new Error('Cluster has no members') }
  }

  // Link all detections to the deer
  const { error: linkError } = await supabase
    .from('detections')
    .update({ deer_id: deer.id } as never)
    .in(
      'id',
      members.map((m) => m.detection_id)
    )

  if (linkError) {
    // Rollback deer creation
    await supabase.from('deer').delete().eq('id', deer.id)
    return { data: null, error: new Error(linkError.message) }
  }

  // Update cluster status
  const { error: updateClusterError } = await supabase
    .from('trophy_clusters')
    .update({
      status: 'named',
      created_deer_id: deer.id,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', clusterId)

  if (updateClusterError) {
    // Don't rollback - deer creation succeeded
    console.error('Failed to update cluster status:', updateClusterError)
  }

  return {
    data: {
      deer_id: deer.id,
      linked_count: members.length,
    },
    error: null,
  }
}
