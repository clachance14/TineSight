-- 044_showcases.sql
-- Public, no-login, revocable Showcase links (ADR 0001).
-- A Lease operator curates trophy Bucks into a shareable, unguessable-token link
-- for prospective lessees. This is the ONE deliberate public-read path in an
-- otherwise per-user RLS-isolated app (Constitution P3). Security model validated
-- by Codex: owner-only RLS here; the PUBLIC read happens via a SECURITY DEFINER
-- RPC returning a fixed DTO (added in a later increment), NEVER by an anon policy.

-- ── showcases ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS showcases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,          -- unguessable (crypto random, app-generated)
  title       TEXT NOT NULL DEFAULT 'Trophy Showcase',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE, -- revoke = false; regenerate = new token
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_showcases_user_id ON showcases (user_id);
-- Active-token lookup is the public hot path.
CREATE INDEX IF NOT EXISTS idx_showcases_token_active
  ON showcases (token) WHERE is_active = TRUE;

ALTER TABLE showcases ENABLE ROW LEVEL SECURITY;

-- Owner-only. NO anon/public policy: public reads go through the SECURITY DEFINER
-- RPC only, so there is no broad public SELECT surface on this table.
DROP POLICY IF EXISTS showcases_owner_all ON showcases;
CREATE POLICY showcases_owner_all ON showcases
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── showcase_bucks (curated members, ordered) ────────────────────────────────
CREATE TABLE IF NOT EXISTS showcase_bucks (
  showcase_id UUID NOT NULL REFERENCES showcases(id) ON DELETE CASCADE,
  deer_id     UUID NOT NULL REFERENCES deer(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (showcase_id, deer_id)
);

CREATE INDEX IF NOT EXISTS idx_showcase_bucks_showcase ON showcase_bucks (showcase_id, position);

ALTER TABLE showcase_bucks ENABLE ROW LEVEL SECURITY;

-- Owner-only via the parent showcase's ownership.
DROP POLICY IF EXISTS showcase_bucks_owner_all ON showcase_bucks;
CREATE POLICY showcase_bucks_owner_all ON showcase_bucks
  FOR ALL
  USING (EXISTS (SELECT 1 FROM showcases s WHERE s.id = showcase_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM showcases s WHERE s.id = showcase_id AND s.user_id = auth.uid()));

-- ── Cross-tenant invariant (Codex hole #2) ───────────────────────────────────
-- A curated Buck MUST belong to the showcase's owner. Without this, any bug that
-- lets an owner insert an arbitrary deer_id could publicly expose another
-- account's Buck. Enforced in the DB, not just app code.
CREATE OR REPLACE FUNCTION enforce_showcase_buck_same_owner()
RETURNS TRIGGER AS $$
DECLARE
  v_showcase_owner UUID;
  v_deer_owner UUID;
BEGIN
  SELECT user_id INTO v_showcase_owner FROM showcases WHERE id = NEW.showcase_id;
  SELECT user_id INTO v_deer_owner FROM deer WHERE id = NEW.deer_id;
  IF v_showcase_owner IS NULL OR v_deer_owner IS NULL OR v_showcase_owner <> v_deer_owner THEN
    RAISE EXCEPTION 'showcase_bucks: deer % does not belong to showcase % owner', NEW.deer_id, NEW.showcase_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_showcase_buck_same_owner ON showcase_bucks;
CREATE TRIGGER trg_showcase_buck_same_owner
  BEFORE INSERT OR UPDATE ON showcase_bucks
  FOR EACH ROW EXECUTE FUNCTION enforce_showcase_buck_same_owner();
