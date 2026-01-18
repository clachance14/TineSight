import { createClient } from '@/lib/supabase/server'
import type { AntlerFingerprint } from '@/types/fingerprint'

export interface DashboardStats {
  totalTrophyDetections: number
  assignedCount: number
  pendingMatchCount: number
  clusterCount: number
  unclusteredCount: number
}

export interface TrophyDetection {
  id: string
  image_id: string
  thumbnail_url: string | null
  captured_at: string | null
  size_class: string
  estimated_point_range: string | null
  antler_print: AntlerFingerprint | null
  deer_id: string | null
}

export interface PendingMatchGroup {
  deer: {
    id: string
    name: string
    reference_image_url: string | null
    antler_print: AntlerFingerprint | null
  }
  pending_matches: EnhancedMatchCandidate[]
  total_count: number
}

export interface EnhancedMatchCandidate {
  id: string
  detection: TrophyDetection
  visual_confidence: number
  antler_print_similarity: number | null
  gemini_reasoning: string | null
  possible_broken_tine: boolean
}

export interface TrophyCluster {
  id: string
  representative_detection_id: string | null
  representative_crop_url: string | null
  status: 'pending' | 'named' | 'merged' | 'split' | 'dismissed'
  member_count: number
  avg_similarity: number | null
  min_similarity: number | null
  members: TrophyDetection[]
}

export interface DashboardData {
  stats: DashboardStats
  pendingGroups: PendingMatchGroup[]
  clusters: TrophyCluster[]
  unclustered: TrophyDetection[]
}

/**
 * Get trophy dashboard summary stats
 */
export async function getTrophyStats(
  userId: string
): Promise<{ data: DashboardStats | null; error: Error | null }> {
  const supabase = await createClient()

  try {
    // Get total trophy detections
    const { count: totalTrophy } = await supabase
      .from('detections')
      .select('*', { count: 'exact', head: true })
      .eq('images.user_id', userId)
      .eq('size_class', 'trophy')
      .is('deleted_at', null)

    // Get assigned count (trophy detections with deer_id)
    const { count: assigned } = await supabase
      .from('detections')
      .select('*, images!inner(user_id)', { count: 'exact', head: true })
      .eq('images.user_id', userId)
      .eq('size_class', 'trophy')
      .not('deer_id', 'is', null)
      .is('deleted_at', null)

    // Get pending match count
    const { count: pendingMatches } = await supabase
      .from('match_candidates')
      .select('*, detection:detections!detection_id(id, image_id, size_class, images!inner(user_id))', {
        count: 'exact',
        head: true
      })
      .eq('status', 'pending')
      .eq('detection.size_class', 'trophy')
      .eq('detection.images.user_id', userId)

    // Get cluster count
    const { count: clusters } = await supabase
      .from('trophy_clusters')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending')

    // Get unclustered count (trophy detections with fingerprints, not assigned, not in clusters)
    const { count: unclustered } = await supabase
      .from('detections')
      .select('*, images!inner(user_id)', { count: 'exact', head: true })
      .eq('images.user_id', userId)
      .eq('size_class', 'trophy')
      .is('deer_id', null)
      .not('antler_fingerprint', 'is', null)
      .is('deleted_at', null)

    // Subtract clustered detections from unclustered
    const { count: clustered } = await supabase
      .from('trophy_cluster_members')
      .select('*, cluster:trophy_clusters!cluster_id(user_id, status)', {
        count: 'exact',
        head: true
      })
      .eq('cluster.user_id', userId)
      .eq('cluster.status', 'pending')

    return {
      data: {
        totalTrophyDetections: totalTrophy ?? 0,
        assignedCount: assigned ?? 0,
        pendingMatchCount: pendingMatches ?? 0,
        clusterCount: clusters ?? 0,
        unclusteredCount: (unclustered ?? 0) - (clustered ?? 0),
      },
      error: null,
    }
  } catch (e) {
    return { data: null, error: e as Error }
  }
}

/**
 * Get pending matches grouped by deer
 */
export async function getPendingMatchGroups(
  userId: string
): Promise<{ data: PendingMatchGroup[] | null; error: Error | null }> {
  const supabase = await createClient()

  try {
    // Get all pending matches for trophy detections
    const { data: matches, error } = await supabase
      .from('match_candidates')
      .select(`
        id,
        gemini_confidence,
        gemini_reasoning,
        antler_print_similarity,
        detection:detections!detection_id(
          id,
          image_id,
          crop_file_path,
          size_class,
          estimated_point_range,
          antler_fingerprint,
          deer_id,
          images!inner(user_id, captured_at)
        ),
        suggested_deer:deer!candidate_deer_id(
          id,
          name,
          antler_fingerprint,
          reference_detection:detections!reference_detection_id(
            crop_file_path
          )
        )
      `)
      .eq('status', 'pending')
      .eq('detection.size_class', 'trophy')
      .eq('detection.images.user_id', userId)
      .order('gemini_confidence', { ascending: false })

    if (error) {
      return { data: null, error }
    }

    // Group by deer
    const grouped = new Map<string, PendingMatchGroup>()

    for (const match of matches ?? []) {
      const detection = match.detection as unknown as {
        id: string
        image_id: string
        crop_file_path: string | null
        size_class: string
        estimated_point_range: string | null
        antler_fingerprint: AntlerFingerprint | null
        deer_id: string | null
        images: { user_id: string; captured_at: string | null }
      }

      const deer = match.suggested_deer as unknown as {
        id: string
        name: string
        antler_fingerprint: AntlerFingerprint | null
        reference_detection: { crop_file_path: string | null } | null
      }

      if (!deer) continue

      // Generate signed URL for detection crop
      let thumbnailUrl: string | null = null
      if (detection.crop_file_path) {
        const { data: urlData } = await supabase.storage
          .from('photos')
          .createSignedUrl(detection.crop_file_path, 3600)
        thumbnailUrl = urlData?.signedUrl ?? null
      }

      // Generate signed URL for deer reference image
      let referenceUrl: string | null = null
      if (deer.reference_detection?.crop_file_path) {
        const { data: urlData } = await supabase.storage
          .from('photos')
          .createSignedUrl(deer.reference_detection.crop_file_path, 3600)
        referenceUrl = urlData?.signedUrl ?? null
      }

      if (!grouped.has(deer.id)) {
        grouped.set(deer.id, {
          deer: {
            id: deer.id,
            name: deer.name,
            reference_image_url: referenceUrl,
            antler_print: deer.antler_fingerprint,
          },
          pending_matches: [],
          total_count: 0,
        })
      }

      const group = grouped.get(deer.id)!

      // Check for possible broken tine (high visual, low fingerprint)
      const possibleBrokenTine =
        (match.gemini_confidence ?? 0) >= 70 &&
        (match.antler_print_similarity ?? 1) < 0.7

      group.pending_matches.push({
        id: match.id,
        detection: {
          id: detection.id,
          image_id: detection.image_id,
          thumbnail_url: thumbnailUrl,
          captured_at: detection.images.captured_at,
          size_class: detection.size_class,
          estimated_point_range: detection.estimated_point_range,
          antler_print: detection.antler_fingerprint,
          deer_id: detection.deer_id,
        },
        visual_confidence: match.gemini_confidence ?? 0,
        antler_print_similarity: match.antler_print_similarity,
        gemini_reasoning: match.gemini_reasoning,
        possible_broken_tine: possibleBrokenTine,
      })

      group.total_count++
    }

    return { data: Array.from(grouped.values()), error: null }
  } catch (e) {
    return { data: null, error: e as Error }
  }
}

/**
 * Get pending trophy clusters
 */
export async function getTrophyClusters(
  userId: string
): Promise<{ data: TrophyCluster[] | null; error: Error | null }> {
  const supabase = await createClient()

  try {
    const { data: clusters, error } = await supabase
      .from('trophy_clusters')
      .select(`
        id,
        representative_detection_id,
        status,
        member_count,
        avg_similarity,
        min_similarity,
        representative:detections!representative_detection_id(crop_file_path)
      `)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('avg_similarity', { ascending: false })

    if (error) {
      return { data: null, error }
    }

    // For each cluster, get member detections
    const clustersWithMembers: TrophyCluster[] = []

    for (const cluster of clusters ?? []) {
      const representative = cluster.representative as unknown as { crop_file_path: string | null } | null

      // Get representative crop URL
      let representativeUrl: string | null = null
      if (representative?.crop_file_path) {
        const { data: urlData } = await supabase.storage
          .from('photos')
          .createSignedUrl(representative.crop_file_path, 3600)
        representativeUrl = urlData?.signedUrl ?? null
      }

      // Get cluster members
      const { data: members } = await supabase
        .from('trophy_cluster_members')
        .select(`
          detection:detections!detection_id(
            id,
            image_id,
            crop_file_path,
            size_class,
            estimated_point_range,
            antler_fingerprint,
            deer_id,
            images!inner(captured_at)
          )
        `)
        .eq('cluster_id', cluster.id)
        .limit(10) // Show first 10 members

      const memberDetections: TrophyDetection[] = []

      for (const member of members ?? []) {
        const detection = member.detection as unknown as {
          id: string
          image_id: string
          crop_file_path: string | null
          size_class: string
          estimated_point_range: string | null
          antler_fingerprint: AntlerFingerprint | null
          deer_id: string | null
          images: { captured_at: string | null }
        }

        let thumbnailUrl: string | null = null
        if (detection.crop_file_path) {
          const { data: urlData } = await supabase.storage
            .from('photos')
            .createSignedUrl(detection.crop_file_path, 3600)
          thumbnailUrl = urlData?.signedUrl ?? null
        }

        memberDetections.push({
          id: detection.id,
          image_id: detection.image_id,
          thumbnail_url: thumbnailUrl,
          captured_at: detection.images.captured_at,
          size_class: detection.size_class,
          estimated_point_range: detection.estimated_point_range,
          antler_print: detection.antler_fingerprint,
          deer_id: detection.deer_id,
        })
      }

      clustersWithMembers.push({
        id: cluster.id,
        representative_detection_id: cluster.representative_detection_id,
        representative_crop_url: representativeUrl,
        status: cluster.status as 'pending' | 'named' | 'merged' | 'split' | 'dismissed',
        member_count: cluster.member_count,
        avg_similarity: cluster.avg_similarity,
        min_similarity: cluster.min_similarity,
        members: memberDetections,
      })
    }

    return { data: clustersWithMembers, error: null }
  } catch (e) {
    return { data: null, error: e as Error }
  }
}

/**
 * Get unclustered trophy detections
 */
export async function getUnclusteredTrophies(
  userId: string
): Promise<{ data: TrophyDetection[] | null; error: Error | null }> {
  const supabase = await createClient()

  try {
    // Get trophy detections that are not assigned and not in any cluster
    const { data: detections, error } = await supabase
      .from('detections')
      .select(`
        id,
        image_id,
        crop_file_path,
        size_class,
        estimated_point_range,
        antler_fingerprint,
        deer_id,
        images!inner(user_id, captured_at)
      `)
      .eq('images.user_id', userId)
      .eq('size_class', 'trophy')
      .is('deer_id', null)
      .not('antler_fingerprint', 'is', null)
      .is('deleted_at', null)
      .order('images.captured_at', { ascending: false })
      .limit(50)

    if (error) {
      return { data: null, error }
    }

    // Filter out detections that are in clusters
    const { data: clusteredIds } = await supabase
      .from('trophy_cluster_members')
      .select('detection_id, cluster:trophy_clusters!cluster_id(status)')
      .eq('cluster.status', 'pending')

    const clusteredSet = new Set(
      (clusteredIds ?? []).map((c) => c.detection_id)
    )

    const unclustered: TrophyDetection[] = []

    for (const detection of detections ?? []) {
      const d = detection as unknown as {
        id: string
        image_id: string
        crop_file_path: string | null
        size_class: string
        estimated_point_range: string | null
        antler_fingerprint: AntlerFingerprint | null
        deer_id: string | null
        images: { user_id: string; captured_at: string | null }
      }

      // Skip if in a cluster
      if (clusteredSet.has(d.id)) continue

      let thumbnailUrl: string | null = null
      if (d.crop_file_path) {
        const { data: urlData } = await supabase.storage
          .from('photos')
          .createSignedUrl(d.crop_file_path, 3600)
        thumbnailUrl = urlData?.signedUrl ?? null
      }

      unclustered.push({
        id: d.id,
        image_id: d.image_id,
        thumbnail_url: thumbnailUrl,
        captured_at: d.images.captured_at,
        size_class: d.size_class,
        estimated_point_range: d.estimated_point_range,
        antler_print: d.antler_fingerprint,
        deer_id: d.deer_id,
      })
    }

    return { data: unclustered, error: null }
  } catch (e) {
    return { data: null, error: e as Error }
  }
}

/**
 * Get complete trophy dashboard data
 */
export async function getTrophyDashboard(
  userId: string
): Promise<{ data: DashboardData | null; error: Error | null }> {
  try {
    const [statsResult, pendingGroupsResult, clustersResult, unclusteredResult] =
      await Promise.all([
        getTrophyStats(userId),
        getPendingMatchGroups(userId),
        getTrophyClusters(userId),
        getUnclusteredTrophies(userId),
      ])

    if (statsResult.error) {
      return { data: null, error: statsResult.error }
    }
    if (pendingGroupsResult.error) {
      return { data: null, error: pendingGroupsResult.error }
    }
    if (clustersResult.error) {
      return { data: null, error: clustersResult.error }
    }
    if (unclusteredResult.error) {
      return { data: null, error: unclusteredResult.error }
    }

    return {
      data: {
        stats: statsResult.data!,
        pendingGroups: pendingGroupsResult.data!,
        clusters: clustersResult.data!,
        unclustered: unclusteredResult.data!,
      },
      error: null,
    }
  } catch (e) {
    return { data: null, error: e as Error }
  }
}

// Note: Batch operations are implemented in lib/services/matching.ts
// and exported from there for use in the API routes
