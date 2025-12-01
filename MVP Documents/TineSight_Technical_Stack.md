# TineSight - Technical Stack Summary

## Overview
AI-powered SaaS application for game camera image management, whitetail deer identification and tracking.

---

## Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **Next.js 14** | React framework with App Router, API routes |
| **TypeScript** | Type safety |
| **TailwindCSS** | Styling |
| **shadcn/ui** | Accessible component library |
| **React Query** | Data fetching/caching |
| **Zustand** | State management |

### Backend & API
| Technology | Purpose |
|------------|---------|
| **Next.js API Routes** | Serverless REST API endpoints |
| **Trigger.dev** | Background job processing |
| **Vercel** | Hosting (frontend + API) |

### Database & Storage
| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Primary database (via Supabase) |
| **pgvector** | Vector similarity search for embeddings |
| **Supabase** | Managed Postgres + Auth + Storage |
| **Supabase Storage** | S3-compatible image storage |

### Machine Learning
| Technology | Purpose |
|------------|---------|
| **Replicate API** | Cloud-hosted ML inference |
| **MegaDetector v6** | Animal detection (via Replicate) |
| **Custom Re-ID Model** | Individual deer identification (via Replicate) |

### Payments & Auth
| Technology | Purpose |
|------------|---------|
| **Supabase Auth** | Authentication (Email, OAuth, Magic Link) |
| **Stripe** | Subscription billing |

---

## Core Services

### 1. Supabase
- **URL**: https://supabase.com
- **Purpose**: Managed PostgreSQL, Authentication, File Storage
- **Features**: Row Level Security, Real-time subscriptions, pgvector extension

### 2. Replicate API
- **URL**: https://replicate.com
- **Purpose**: Cloud-hosted ML model inference
- **Models Used**:
  - MegaDetector for animal detection
  - Custom re-ID model for deer identification

```typescript
// Example: Calling MegaDetector via Replicate
import Replicate from 'replicate';

const replicate = new Replicate();
const output = await replicate.run(
  "microsoft/megadetector-v6",
  { input: { image: imageUrl } }
);
// Returns: { detections: [{ bbox: [...], conf: 0.95, class: 'animal' }] }
```

### 3. Trigger.dev
- **URL**: https://trigger.dev
- **Purpose**: Serverless background job processing
- **Use Cases**: Image processing, batch operations, email notifications

### 4. Stripe
- **URL**: https://stripe.com
- **Purpose**: Subscription management and payments
- **Tiers**: Free ($0), Pro ($9.99/mo), Ranch ($29.99/mo)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      User Browser                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Vercel (Next.js App)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Frontend   │  │  API Routes  │  │  Middleware  │      │
│  │   (React)    │  │  (Server)    │  │   (Auth)     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────┬──────────────┬────────────────┬──────────────────┘
           │              │                │
     ┌─────┘              │                └─────┐
     ▼                    ▼                      ▼
┌──────────┐       ┌─────────────┐        ┌───────────┐
│ Supabase │       │ Trigger.dev │        │  Stripe   │
│ (DB/Auth │       │ (Background │        │(Payments) │
│ /Storage)│       │   Jobs)     │        └───────────┘
└──────────┘       └──────┬──────┘
                          │
                          ▼
                   ┌─────────────┐
                   │ Replicate   │
                   │ (ML Models) │
                   └─────────────┘
```

---

## Processing Pipeline

```
1. IMAGE UPLOAD
   Browser → Supabase Storage
            │
            ▼
2. QUEUE JOB
   API Route → Trigger.dev
            │
            ▼
3. MEGADETECTOR (Replicate API)
   Classify: Animal / Human / Vehicle / Empty
            │
   ┌────────┼────────┐
   ▼        ▼        ▼
 EMPTY   ANIMAL    OTHER
 Archive Detected  (log)
            │
            ▼
4. DEER RE-ID (Replicate API)
   Generate 512-dim embedding
            │
            ▼
5. VECTOR SEARCH (pgvector)
   Find similar deer in catalog
            │
   ┌────────┴────────┐
   ▼                 ▼
 MATCH           NEW DEER
 Found           Entry
 (confirm)       (create)
```

---

## Database Schema (Core Tables)

```sql
-- User profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free', -- free, pro, ranch
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members for collaboration
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer', -- 'owner', 'viewer'
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(account_id, user_id)
);

-- Camera locations
CREATE TABLE cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location_lat DECIMAL(9,6),
  location_lng DECIMAL(9,6),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Uploaded images
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  captured_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  detection_status TEXT DEFAULT 'pending', -- pending, processing, completed, error
  classification TEXT, -- animal, human, vehicle, empty
  confidence DECIMAL(4,3),
  is_archived BOOLEAN DEFAULT FALSE
);

-- AI detections (bounding boxes)
CREATE TABLE detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID REFERENCES images(id) ON DELETE CASCADE,
  bbox_x INTEGER,
  bbox_y INTEGER,
  bbox_width INTEGER,
  bbox_height INTEGER,
  class TEXT, -- deer, other_animal, human, vehicle
  confidence DECIMAL(4,3),
  deer_id UUID REFERENCES deer(id) ON DELETE SET NULL
);

-- Individual deer catalog
CREATE TABLE deer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT,
  first_seen DATE,
  last_seen DATE,
  notes TEXT,
  tags TEXT[], -- e.g., ARRAY['8-point', 'mature', 'shooter']
  representative_image_id UUID
);

-- Deer embeddings for re-identification
CREATE TABLE deer_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deer_id UUID REFERENCES deer(id) ON DELETE CASCADE,
  detection_id UUID REFERENCES detections(id) ON DELETE CASCADE,
  embedding VECTOR(512), -- pgvector column
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable vector similarity search
CREATE INDEX ON deer_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

---

## User Roles

| Role | Capabilities |
|------|--------------|
| **Owner** | Full access: upload, process, manage cameras, invite viewers, manage subscription |
| **Viewer/Trainer** | Limited: view photos, confirm/reject deer matches, add notes. Cannot upload or manage account |

---

## Re-Identification Approach

### Recommended: Cloud-Hosted Embeddings via Replicate

1. **MVP Phase**: Use pre-trained model via Replicate API
2. **Collect Training Data**: User-confirmed matches build training dataset
3. **Custom Model**: Train deer-specific re-ID model when sufficient data
4. **Store Embeddings**: 512-dim vectors in pgvector for similarity search

### Matching Flow
```typescript
// 1. Generate embedding for new deer detection
const embedding = await replicate.run("deer-reid-model", { input: { image: cropUrl } });

// 2. Search for similar embeddings in Supabase
const { data: matches } = await supabase.rpc('match_deer', {
  query_embedding: embedding,
  match_threshold: 0.8,
  match_count: 5
});

// 3. Present top matches to user for confirmation
```

---

## Development Phases

### Phase 1: MVP
- [x] Project setup (Next.js + Supabase + Vercel)
- [ ] User authentication (Supabase Auth)
- [ ] Stripe subscription integration
- [ ] Image upload and storage
- [ ] MegaDetector via Replicate
- [ ] Empty image filtering
- [ ] Photo gallery UI
- [ ] Manual deer tagging

### Phase 2: Re-ID & Collaboration
- [ ] Deer re-ID model integration
- [ ] Match suggestion UI
- [ ] Review queue
- [ ] Team member invitations
- [ ] Mobile-responsive view/train interface

### Phase 3: Polish
- [ ] Movement visualization
- [ ] Reports/exports
- [ ] Performance optimization
- [ ] Native mobile app

---

## Quick Start Commands

```bash
# Create Next.js project
npx create-next-app@latest tinesight --typescript --tailwind --eslint --app

# Install dependencies
cd tinesight
npm install @supabase/supabase-js @supabase/ssr
npm install stripe @stripe/stripe-js
npm install @tanstack/react-query zustand
npm install replicate

# Install shadcn/ui
npx shadcn-ui@latest init

# Generate Supabase types
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.ts

# Run development server
npm run dev
```

---

## Resources

- [Next.js 14 Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Trigger.dev Docs](https://trigger.dev/docs)
- [Replicate Docs](https://replicate.com/docs)
- [pgvector](https://github.com/pgvector/pgvector)
- [MegaDetector](https://github.com/agentmorris/MegaDetector)

---

*Document aligned with TineSight_PRD.md and Project_Setup.md - December 2025*
