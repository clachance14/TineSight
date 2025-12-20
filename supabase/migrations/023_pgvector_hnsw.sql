-- =============================================================================
-- Migration 023: Upgrade pgvector index from IVFFlat to HNSW
-- Priority: HIGH
-- Impact: Improves similarity search accuracy from ~90% to ~99% recall
-- =============================================================================
-- HNSW (Hierarchical Navigable Small World) provides:
-- - Higher recall accuracy (99%+ vs 90% for IVFFlat)
-- - More consistent query latency
-- - No re-training required as data grows
-- - Better production performance characteristics
-- =============================================================================

-- 1. Drop the old IVFFlat index
DROP INDEX IF EXISTS idx_deer_embeddings_vector;

-- 2. Create new HNSW index with optimized parameters
-- m=16: Number of connections per layer (default, good for medium datasets)
-- ef_construction=64: Build-time search breadth (higher = better quality, slower build)
-- Using vector_cosine_ops for cosine similarity (matching deer re-ID use case)
CREATE INDEX idx_deer_embeddings_vector_hnsw
ON deer_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 3. Add comment for runtime parameter guidance
COMMENT ON INDEX idx_deer_embeddings_vector_hnsw IS
  'HNSW index for deer re-identification embeddings. For optimal query performance, use: SET LOCAL hnsw.ef_search = 40;';
