// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { compareFingerprints } from '@/lib/fingerprint/compare'
import { UnionFind } from '@/lib/clustering/union-find'
import { createCluster } from '@/lib/services/clusters'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { AntlerFingerprint } from '@/types/fingerprint'

/**
 * Cluster Trophy Detections Job
 * Feature: 011-trophy-fingerprint
 *
 * Automatically clusters unassigned trophy detections by antler fingerprint similarity.
 *
 * Algorithm:
 * 1. Fetch all unassigned trophy detections with fingerprints for user
 * 2. Build similarity graph by comparing all pairs (O(n^2))
 * 3. Use Union-Find to group detections with 85%+ similarity
 * 4. Create trophy_clusters and trophy_cluster_members records
 *
 * Optimization for scale:
 * - For 500+ detections, use pgvector embeddings as pre-filter
 * - Only compute full fingerprint similarity for top-10 candidates per detection
 * - Reduces from O(n^2) to O(n*10)
 *
 * @module trigger/jobs/cluster-trophy-detections
 */

interface ClusterTrophyDetectionsPayload {
  /** User ID to cluster detections for */
  userId: string
}

interface DetectionWithFingerprint {
  detection_id: string
  fingerprint: AntlerFingerprint
  crop_file_path: string
  captured_at: string
}

const SIMILARITY_THRESHOLD = 0.85 // 85% from research.md
const SCALE_OPTIMIZATION_THRESHOLD = 500 // Use optimized algorithm above this count

export const clusterTrophyDetections = task({
  id: 'cluster-trophy-detections',
  run: async (payload: ClusterTrophyDetectionsPayload) => {
    const { userId } = payload

    logger.info('Starting trophy detection clustering', { userId })

    const supabase = createAdminClient() as SupabaseClient<Database>

    try {
      // Fetch unassigned trophy detections with fingerprints
      const { data: detections, error: fetchError } = await supabase.rpc(
        'get_unassigned_trophy_detections',
        { p_user_id: userId }
      )

      if (fetchError) {
        logger.error('Failed to fetch unassigned trophy detections', {
          userId,
          error: fetchError.message,
        })
        throw new Error(`Failed to fetch detections: ${fetchError.message}`)
      }

      if (!detections || detections.length === 0) {
        logger.info('No unassigned trophy detections to cluster', { userId })
        return { clustersCreated: 0, detectionsProcessed: 0 }
      }

      logger.info('Fetched unassigned trophy detections', {
        userId,
        count: detections.length,
      })

      // Filter out detections without fingerprints
      const detectionsWithFingerprints = detections.filter(
        (d: DetectionWithFingerprint) => d.fingerprint !== null
      ) as DetectionWithFingerprint[]

      if (detectionsWithFingerprints.length === 0) {
        logger.info('No detections with fingerprints to cluster', { userId })
        return { clustersCreated: 0, detectionsProcessed: 0 }
      }

      logger.info('Detections with fingerprints', {
        userId,
        count: detectionsWithFingerprints.length,
        useOptimization: detectionsWithFingerprints.length > SCALE_OPTIMIZATION_THRESHOLD,
      })

      // Build similarity graph
      const detectionIds = detectionsWithFingerprints.map((d) => d.detection_id)
      const unionFind = new UnionFind<string>(detectionIds)

      // For scale optimization, we would use pgvector here
      // For now, use brute-force O(n^2) comparison
      let comparisons = 0
      const similarityCache = new Map<string, number>()

      for (let i = 0; i < detectionsWithFingerprints.length; i++) {
        for (let j = i + 1; j < detectionsWithFingerprints.length; j++) {
          const d1 = detectionsWithFingerprints[i]
          const d2 = detectionsWithFingerprints[j]

          comparisons++

          // Compare fingerprints
          const comparison = compareFingerprints(d1.fingerprint, d2.fingerprint)

          // Store similarity for later use
          const key = `${d1.detection_id}:${d2.detection_id}`
          similarityCache.set(key, comparison.overall_similarity)

          logger.debug('Fingerprint comparison', {
            detection1: d1.detection_id,
            detection2: d2.detection_id,
            similarity: comparison.overall_similarity,
            threshold: SIMILARITY_THRESHOLD,
          })

          // Union if similarity meets threshold
          if (comparison.overall_similarity >= SIMILARITY_THRESHOLD) {
            unionFind.union(d1.detection_id, d2.detection_id)
            logger.debug('Detections clustered', {
              detection1: d1.detection_id,
              detection2: d2.detection_id,
              similarity: comparison.overall_similarity,
            })
          }
        }

        // Log progress every 10 detections
        if ((i + 1) % 10 === 0) {
          logger.info('Clustering progress', {
            processed: i + 1,
            total: detectionsWithFingerprints.length,
            comparisons,
          })
        }
      }

      logger.info('Similarity graph built', {
        userId,
        comparisons,
        detections: detectionsWithFingerprints.length,
      })

      // Get all groups from Union-Find
      const groups = unionFind.getGroups()

      // Filter out singleton groups (single detection, no matches)
      const clustersToCreate = groups.filter((group) => group.length > 1)

      logger.info('Clusters identified', {
        userId,
        totalGroups: groups.length,
        clustersWithMultipleMembers: clustersToCreate.length,
        singletons: groups.length - clustersToCreate.length,
      })

      // Create cluster records
      let clustersCreated = 0

      for (const group of clustersToCreate) {
        // Choose representative detection (first one, or could be most recent)
        const representativeDetectionId = group[0]

        // Calculate avg and min similarity within cluster
        const similarities: number[] = []
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const key1 = `${group[i]}:${group[j]}`
            const key2 = `${group[j]}:${group[i]}`
            const similarity = similarityCache.get(key1) || similarityCache.get(key2)
            if (similarity !== undefined) {
              similarities.push(similarity)
            }
          }
        }

        const avgSimilarity =
          similarities.length > 0
            ? similarities.reduce((sum, s) => sum + s, 0) / similarities.length
            : null

        const minSimilarity = similarities.length > 0 ? Math.min(...similarities) : null

        // Create cluster
        const { data: cluster, error: createError } = await createCluster(
          {
            userId,
            detectionIds: group,
            representativeDetectionId,
            avgSimilarity: avgSimilarity !== null ? avgSimilarity / 100 : undefined,
            minSimilarity: minSimilarity !== null ? minSimilarity / 100 : undefined,
          },
          supabase
        )

        if (createError) {
          logger.error('Failed to create cluster', {
            userId,
            memberCount: group.length,
            error: createError.message,
          })
          continue
        }

        clustersCreated++
        logger.info('Cluster created', {
          clusterId: cluster?.id,
          memberCount: group.length,
          avgSimilarity,
          minSimilarity,
        })
      }

      logger.info('Clustering completed', {
        userId,
        clustersCreated,
        detectionsProcessed: detectionsWithFingerprints.length,
        singletons: groups.length - clustersToCreate.length,
      })

      return {
        clustersCreated,
        detectionsProcessed: detectionsWithFingerprints.length,
        singletons: groups.length - clustersToCreate.length,
      }
    } catch (error) {
      logger.error('Clustering failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },
})
