-- ============================================================================
-- TineSight Initial Schema Migration
-- ============================================================================
-- This migration creates the complete database schema for TineSight MVP
-- including tables, RLS policies, helper functions, and triggers.
-- ============================================================================

-- Enable pgvector extension for ML embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles: User profile data (extends auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    subscription_tier TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- team_members: Account collaboration and role-based access
-- ----------------------------------------------------------------------------
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'viewer')),
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(account_id, user_id)
);

-- ----------------------------------------------------------------------------
-- cameras: Trail camera metadata
-- ----------------------------------------------------------------------------
CREATE TABLE cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location_lat DECIMAL(9,6),
    location_lng DECIMAL(9,6),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- images: Uploaded photos from trail cameras
-- ----------------------------------------------------------------------------
CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    captured_at TIMESTAMPTZ,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    detection_status TEXT NOT NULL DEFAULT 'pending' CHECK (detection_status IN ('pending', 'processing', 'completed', 'failed')),
    classification TEXT,
    confidence DECIMAL(4,3),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- deer: Individual deer profiles in the catalog
-- ----------------------------------------------------------------------------
CREATE TABLE deer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT,
    first_seen DATE,
    last_seen DATE,
    notes TEXT,
    tags TEXT[],
    status TEXT NOT NULL DEFAULT 'watching' CHECK (status IN ('watching', 'target', 'harvested')),
    harvested_at TIMESTAMPTZ,
    representative_image_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- detections: Bounding boxes from ML detection model
-- ----------------------------------------------------------------------------
CREATE TABLE detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    bbox_x INTEGER,
    bbox_y INTEGER,
    bbox_width INTEGER,
    bbox_height INTEGER,
    class TEXT,
    confidence DECIMAL(4,3),
    deer_id UUID REFERENCES deer(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- deer_embeddings: Vector embeddings for deer re-identification
-- ----------------------------------------------------------------------------
CREATE TABLE deer_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deer_id UUID NOT NULL REFERENCES deer(id) ON DELETE CASCADE,
    detection_id UUID NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
    embedding VECTOR(512) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint for representative_image_id after images table exists
ALTER TABLE deer
ADD CONSTRAINT deer_representative_image_id_fkey
FOREIGN KEY (representative_image_id) REFERENCES images(id) ON DELETE SET NULL;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Performance indexes for common queries
CREATE INDEX idx_team_members_account_id ON team_members(account_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_cameras_user_id ON cameras(user_id);
CREATE INDEX idx_images_user_id ON images(user_id);
CREATE INDEX idx_images_camera_id ON images(camera_id);
CREATE INDEX idx_images_detection_status ON images(detection_status);
CREATE INDEX idx_images_captured_at ON images(captured_at);
CREATE INDEX idx_deer_user_id ON deer(user_id);
CREATE INDEX idx_deer_status ON deer(status);
CREATE INDEX idx_detections_image_id ON detections(image_id);
CREATE INDEX idx_detections_deer_id ON detections(deer_id);
CREATE INDEX idx_deer_embeddings_deer_id ON deer_embeddings(deer_id);
CREATE INDEX idx_deer_embeddings_detection_id ON deer_embeddings(detection_id);

-- Vector similarity index for efficient nearest neighbor search
CREATE INDEX idx_deer_embeddings_vector ON deer_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- has_account_access: Check if current user can access account data
-- Returns TRUE if user is account owner OR accepted team member
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION has_account_access(account_owner_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        -- User is the account owner
        auth.uid() = account_owner_id
        OR
        -- User is an accepted team member
        EXISTS (
            SELECT 1
            FROM team_members
            WHERE account_id = account_owner_id
            AND user_id = auth.uid()
            AND accepted_at IS NOT NULL
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- handle_new_user: Auto-create profile when new user signs up
-- Trigger function called after INSERT on auth.users
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-create profile when user signs up
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE deer ENABLE ROW LEVEL SECURITY;
ALTER TABLE detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE deer_embeddings ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- profiles: Users can read/update own profile, INSERT via trigger only
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- team_members: Account owners manage team, members view own membership
-- ----------------------------------------------------------------------------
CREATE POLICY "Account owners can manage team members"
    ON team_members FOR ALL
    USING (auth.uid() = account_id);

CREATE POLICY "Users can view their own team memberships"
    ON team_members FOR SELECT
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- cameras: Access if owner OR team member with accepted invite
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view accessible cameras"
    ON cameras FOR SELECT
    USING (has_account_access(user_id));

CREATE POLICY "Account owners can insert cameras"
    ON cameras FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Account owners can update own cameras"
    ON cameras FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Account owners can delete own cameras"
    ON cameras FOR DELETE
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- images: Access if owner OR team member with accepted invite
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view accessible images"
    ON images FOR SELECT
    USING (has_account_access(user_id));

CREATE POLICY "Account owners can insert images"
    ON images FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Account owners can update own images"
    ON images FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Account owners can delete own images"
    ON images FOR DELETE
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- deer: Access if owner OR team member with accepted invite
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view accessible deer"
    ON deer FOR SELECT
    USING (has_account_access(user_id));

CREATE POLICY "Account owners can insert deer"
    ON deer FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Account owners can update own deer"
    ON deer FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Account owners can delete own deer"
    ON deer FOR DELETE
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- detections: Access via parent image relationship
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view detections for accessible images"
    ON detections FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM images
            WHERE images.id = detections.image_id
            AND has_account_access(images.user_id)
        )
    );

CREATE POLICY "Users can insert detections for own images"
    ON detections FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM images
            WHERE images.id = detections.image_id
            AND auth.uid() = images.user_id
        )
    );

CREATE POLICY "Users can update detections for own images"
    ON detections FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM images
            WHERE images.id = detections.image_id
            AND auth.uid() = images.user_id
        )
    );

CREATE POLICY "Users can delete detections for own images"
    ON detections FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM images
            WHERE images.id = detections.image_id
            AND auth.uid() = images.user_id
        )
    );

-- ----------------------------------------------------------------------------
-- deer_embeddings: Access via parent deer relationship
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view embeddings for accessible deer"
    ON deer_embeddings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM deer
            WHERE deer.id = deer_embeddings.deer_id
            AND has_account_access(deer.user_id)
        )
    );

CREATE POLICY "Users can insert embeddings for own deer"
    ON deer_embeddings FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM deer
            WHERE deer.id = deer_embeddings.deer_id
            AND auth.uid() = deer.user_id
        )
    );

CREATE POLICY "Users can update embeddings for own deer"
    ON deer_embeddings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM deer
            WHERE deer.id = deer_embeddings.deer_id
            AND auth.uid() = deer.user_id
        )
    );

CREATE POLICY "Users can delete embeddings for own deer"
    ON deer_embeddings FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM deer
            WHERE deer.id = deer_embeddings.deer_id
            AND auth.uid() = deer.user_id
        )
    );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE profiles IS 'User profile data extending auth.users';
COMMENT ON TABLE team_members IS 'Account collaboration and team access control';
COMMENT ON TABLE cameras IS 'Trail camera metadata and location info';
COMMENT ON TABLE images IS 'Uploaded photos with detection status tracking';
COMMENT ON TABLE deer IS 'Individual deer profiles in catalog';
COMMENT ON TABLE detections IS 'ML-generated bounding boxes for animals';
COMMENT ON TABLE deer_embeddings IS 'Vector embeddings for deer re-identification';

COMMENT ON FUNCTION has_account_access IS 'Check if user can access account data (owner or accepted team member)';
COMMENT ON FUNCTION handle_new_user IS 'Auto-create profile when new user signs up';
