// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { MatchCandidateData } from "@/lib/services/matching";

/**
 * Find Matches Job
 *
 * Performs similarity search to find potential matches for a detection with an embedding.
 * This job is triggered after an embedding is generated for a detection.
 *
 * Workflow:
 * 1. Fetch the embedding vector from deer_embeddings table
 * 2. Call find_similar_deer RPC function to perform pgvector similarity search
 * 3. Create match_candidates records for the top 5 matches (above threshold)
 * 4. Handle "no matches found" case gracefully (new deer candidate)
 *
 * Match Criteria:
 * - Similarity threshold: 0.7 (configurable)
 * - Match count: 5 (top matches)
 * - Only searches within user's own deer catalog (enforced by RLS)
 *
 * Error Handling:
 * - Retry on transient failures (max 3 attempts)
 * - Log errors but don't fail if no matches found (expected for new deer)
 *
 * @module trigger/jobs/find-matches
 */

interface FindMatchesPayload {
  detectionId: string;
  imageId: string;
  userId: string;
}

interface SimilarDeer {
  deer_id: string;
  deer_name: string | null;
  similarity: number;
  detection_id: string;
  image_id: string;
  image_path: string;
}

export const findMatchesTask = task({
  id: "find-matches",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: FindMatchesPayload) => {
    const { detectionId, imageId, userId } = payload;

    logger.info("Starting match search", { detectionId, imageId, userId });

    // Cast to typed client - TypeScript has issues with Database generic in Trigger.dev context
    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Step 1: Fetch the embedding vector from deer_embeddings table
      logger.info("Fetching embedding vector", { detectionId });

      const { data: embeddingRecord, error: embeddingFetchError } =
        await supabase
          .from("deer_embeddings")
          .select("id, embedding, detection_id")
          .eq("detection_id", detectionId)
          .single();

      if (embeddingFetchError || !embeddingRecord) {
        logger.error("Failed to fetch embedding", {
          detectionId,
          error: embeddingFetchError?.message || "Embedding not found",
        });
        throw new Error(
          `Failed to fetch embedding: ${embeddingFetchError?.message || "Embedding not found"}`
        );
      }

      const embedding = embeddingRecord.embedding;
      logger.info("Embedding fetched", {
        detectionId,
        embeddingId: embeddingRecord.id,
        embeddingDimension: Array.isArray(embedding) ? embedding.length : 0,
      });

      // Step 2: Call find_similar_deer RPC function to perform similarity search
      // This uses pgvector's cosine similarity to find matching deer
      logger.info("Calling find_similar_deer RPC", {
        detectionId,
        userId,
        matchCount: 5,
        threshold: 0.7,
      });

      const { data: similarDeer, error: rpcError } = await supabase.rpc(
        "find_similar_deer",
        {
          query_embedding: embedding,
          query_user_id: userId,
          match_count: 5,
          similarity_threshold: 0.7,
        }
      );

      if (rpcError) {
        logger.error("RPC call failed", {
          detectionId,
          error: rpcError.message,
        });
        throw new Error(`find_similar_deer RPC failed: ${rpcError.message}`);
      }

      const matches = (similarDeer || []) as SimilarDeer[];

      logger.info("Similarity search completed", {
        detectionId,
        matchCount: matches.length,
      });

      // Step 3: Handle "no matches found" case gracefully
      if (matches.length === 0) {
        logger.info("No matches found - candidate for new deer", {
          detectionId,
        });

        return {
          success: true,
          detectionId,
          imageId,
          matchesFound: 0,
          candidates: [],
          message: "No similar deer found - candidate for new deer profile",
        };
      }

      // Step 4: Create match_candidates records for the top matches
      logger.info("Creating match candidates", {
        detectionId,
        candidateCount: matches.length,
        topSimilarity: matches[0]?.similarity,
      });

      const candidateData: MatchCandidateData[] = matches.map((match) => ({
        candidate_deer_id: match.deer_id,
        similarity_score: match.similarity,
      }));

      const candidateRows = candidateData.map((candidate) => ({
        detection_id: detectionId,
        candidate_deer_id: candidate.candidate_deer_id,
        similarity_score: candidate.similarity_score,
        status: "pending" as const,
      }));

      const { data: insertedCandidates, error: insertError } = await supabase
        .from("match_candidates")
        .insert(candidateRows)
        .select();

      if (insertError) {
        logger.error("Failed to insert match candidates", {
          detectionId,
          error: insertError.message,
        });
        throw new Error(
          `Failed to insert match candidates: ${insertError.message}`
        );
      }

      logger.info("Match candidates created successfully", {
        detectionId,
        candidatesCreated: insertedCandidates?.length || 0,
      });

      logger.info("Match search completed successfully", {
        detectionId,
        imageId,
        matchesFound: matches.length,
        topSimilarity: matches[0]?.similarity,
      });

      return {
        success: true,
        detectionId,
        imageId,
        matchesFound: matches.length,
        candidates: insertedCandidates || [],
        topSimilarity: matches[0]?.similarity,
      };
    } catch (error) {
      // Error handling: Log failure
      logger.error("Match search failed", {
        detectionId,
        imageId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-throw error so Trigger.dev can handle retry logic
      throw error;
    }
  },
});
