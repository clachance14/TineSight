-- 043_backfill_is_trophy.sql
-- Backfill score_gross + is_trophy for detections already fingerprinted under the
-- OLD size_class='trophy' gate. Migration 042 repointed the clustering RPC to
-- is_trophy but left existing rows at the is_trophy=FALSE default, so the RPC
-- returned nothing for the existing catalog. This derives the authoritative
-- values from the gross_score ALREADY stored in antler_fingerprint JSONB.
--
-- FREE: no Gemini calls — pure SQL from existing data. Additive (sets only the
-- two new columns). Never touches photos/originals. Idempotent (recomputes).
-- See docs/adr/0004-trophy-gated-ai-cost-cascade.md.

UPDATE detections d
SET
  score_gross = round((d.antler_fingerprint->'scores'->>'gross_score')::numeric)::integer,
  is_trophy = (d.antler_fingerprint->'scores'->>'gross_score')::numeric
              >= COALESCE(
                   (SELECT p.trophy_threshold
                    FROM images i
                    JOIN profiles p ON p.id = i.user_id
                    WHERE i.id = d.image_id),
                   130
                 )
WHERE d.antler_fingerprint IS NOT NULL
  AND d.antler_fingerprint->'scores'->>'gross_score' IS NOT NULL;
