# Data Model: Minimal SaaS Foundation

**Feature**: 001-saas-foundation
**Date**: 2025-12-01

## Entity Relationship Diagram

```
┌─────────────────┐
│   auth.users    │  (Supabase managed)
│─────────────────│
│ id: UUID (PK)   │
│ email: TEXT     │
│ created_at      │
└────────┬────────┘
         │ 1:1
         ▼
┌─────────────────┐         ┌─────────────────┐
│    profiles     │ 1:N     │  team_members   │
│─────────────────│◄────────│─────────────────│
│ id: UUID (PK/FK)│         │ id: UUID (PK)   │
│ email           │         │ account_id (FK) │
│ full_name       │         │ user_id (FK)    │
│ subscription_tier│        │ role            │
│ avatar_url      │         │ invited_at      │
│ stripe_customer_id│       │ accepted_at     │
│ created_at      │         └─────────────────┘
│ updated_at      │
└────────┬────────┘
         │ 1:N (future features - schema only)
    ┌────┴────┬────────┐
    ▼         ▼        ▼
┌────────┐ ┌────────┐ ┌────────┐
│cameras │ │ images │ │  deer  │
└────────┘ └────────┘ └────────┘
```

## Entities

### Profile (Core - MVP)

Extends Supabase `auth.users` with application-specific data.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, FK→auth.users | Links to auth user |
| email | TEXT | | User's email (denormalized) |
| full_name | TEXT | | Display name |
| avatar_url | TEXT | nullable | Profile picture URL |
| subscription_tier | TEXT | DEFAULT 'free' | free, pro, ranch |
| stripe_customer_id | TEXT | nullable | Stripe customer ID |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update |

**RLS Policies**:
- SELECT: `auth.uid() = id`
- UPDATE: `auth.uid() = id`
- INSERT: Via trigger only

**Validation Rules**:
- full_name: Optional, but displayed in UI if present
- subscription_tier: ENUM('free', 'pro', 'ranch')
- Profile auto-created on auth.users insert via trigger

---

### Team Member (Schema Only - MVP)

Links users to accounts for collaboration. UI deferred.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| account_id | UUID | FK→profiles, NOT NULL | Owner's profile |
| user_id | UUID | FK→profiles, NOT NULL | Invited user's profile |
| role | TEXT | NOT NULL, DEFAULT 'viewer' | owner, viewer |
| invited_at | TIMESTAMPTZ | DEFAULT NOW() | Invitation time |
| accepted_at | TIMESTAMPTZ | nullable | Acceptance time |

**Constraints**:
- UNIQUE(account_id, user_id) - One membership per account/user pair

**RLS Policies**:
- ALL (account_id): `auth.uid() = account_id` (owners manage)
- SELECT (user_id): `auth.uid() = user_id` (members view own)

---

### Camera (Schema Only)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| user_id | UUID | FK→profiles, NOT NULL | Owner |
| name | TEXT | NOT NULL | Camera name |
| location_lat | DECIMAL(9,6) | nullable | Latitude |
| location_lng | DECIMAL(9,6) | nullable | Longitude |
| notes | TEXT | nullable | User notes |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

### Image (Schema Only)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| user_id | UUID | FK→profiles, NOT NULL | Owner |
| camera_id | UUID | FK→cameras, nullable | Source camera |
| file_path | TEXT | NOT NULL | Storage path |
| file_size_bytes | BIGINT | nullable | File size |
| captured_at | TIMESTAMPTZ | nullable | EXIF timestamp |
| imported_at | TIMESTAMPTZ | DEFAULT NOW() | Import time |
| detection_status | TEXT | DEFAULT 'pending' | pending, processing, completed, error |
| classification | TEXT | nullable | animal, human, vehicle, empty |
| confidence | DECIMAL(4,3) | nullable | Detection confidence |
| is_archived | BOOLEAN | DEFAULT FALSE | Archived flag |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

### Deer (Schema Only)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| user_id | UUID | FK→profiles, NOT NULL | Owner |
| name | TEXT | nullable | User-assigned name |
| first_seen | DATE | nullable | First sighting |
| last_seen | DATE | nullable | Most recent sighting |
| notes | TEXT | nullable | User notes |
| tags | TEXT[] | nullable | Tags array |
| status | TEXT | DEFAULT 'watching' | watching, target, harvested |
| harvested_at | TIMESTAMPTZ | nullable | Date when harvested |
| representative_image_id | UUID | nullable | Primary photo |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Validation Rules**:
- status: CHECK (status IN ('watching', 'target', 'harvested'))
- harvested_at: Should be set when status = 'harvested', NULL otherwise

---

### Detection (Schema Only)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| image_id | UUID | FK→images, NOT NULL | Source image |
| bbox_x | INTEGER | nullable | Bounding box X |
| bbox_y | INTEGER | nullable | Bounding box Y |
| bbox_width | INTEGER | nullable | Bounding box width |
| bbox_height | INTEGER | nullable | Bounding box height |
| class | TEXT | nullable | deer, other_animal, human, vehicle |
| confidence | DECIMAL(4,3) | nullable | Detection confidence |
| deer_id | UUID | FK→deer, nullable | Identified deer |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

### Deer Embedding (Schema Only)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| deer_id | UUID | FK→deer, NOT NULL | Deer reference |
| detection_id | UUID | FK→detections, NOT NULL | Source detection |
| embedding | VECTOR(512) | NOT NULL | Feature vector |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes**:
- ivfflat index on embedding for cosine similarity search

---

## State Transitions

### Profile Subscription Tier
```
free → pro (via Stripe upgrade)
free → ranch (via Stripe upgrade)
pro → ranch (via Stripe upgrade)
pro → free (via cancellation/expiry)
ranch → free (via cancellation/expiry)
```
*Note: Stripe integration deferred - all users start as 'free'*

### Team Member Status
```
(invited) → invited_at set, accepted_at NULL
(invited) → (accepted) → accepted_at set
(any) → (deleted) → row removed
```
*Note: Team invitation UI deferred - schema only*

### Deer Status
```
watching → target (user marks as target buck)
target → harvested (user marks as harvested, sets harvested_at)
watching → harvested (user marks as harvested directly)
harvested → watching (user corrects mistake, clears harvested_at)
```

---

## Helper Functions

### has_account_access(account_owner_id UUID)

Checks if current user has access to an account (owner OR accepted team member).

```sql
CREATE OR REPLACE FUNCTION has_account_access(account_owner_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    auth.uid() = account_owner_id OR
    EXISTS (
      SELECT 1 FROM team_members
      WHERE account_id = account_owner_id
      AND user_id = auth.uid()
      AND accepted_at IS NOT NULL
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### handle_new_user()

Auto-creates profile when auth.users row is inserted.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
