# TineSight - Project Setup Requirements

## SaaS Boilerplate Checklist
**Building from Scratch | Next.js + Supabase + Vercel**

---

## Table of Contents

1. [Tech Stack Overview](#1-tech-stack-overview)
2. [User Roles](#2-user-roles)
3. [Authentication & Users](#3-authentication--users)
4. [Payments & Subscriptions](#4-payments--subscriptions)
5. [Database Schema](#5-database-schema)
6. [File Storage](#6-file-storage)
7. [Background Jobs & Queues](#7-background-jobs--queues)
8. [Email & Notifications](#8-email--notifications)
9. [Analytics & Monitoring](#9-analytics--monitoring)
10. [Core UI Components](#10-core-ui-components)
11. [Environment Variables](#11-environment-variables)
12. [Project Structure](#12-project-structure)
13. [Setup Checklist](#13-setup-checklist)

---

## 1. Tech Stack Overview

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Next.js 14 (App Router) | Full-stack React framework |
| **Language** | TypeScript | Type safety |
| **Styling** | TailwindCSS | Utility-first CSS |
| **UI Components** | shadcn/ui | Accessible component library |
| **Database** | Supabase (PostgreSQL) | Managed Postgres + Auth + Storage |
| **Vector Search** | pgvector | Deer embedding similarity search |
| **Auth** | Supabase Auth | Authentication & sessions |
| **Payments** | Stripe | Subscriptions & billing |
| **File Storage** | Supabase Storage | Image uploads (S3-compatible) |
| **Background Jobs** | Trigger.dev or Inngest | Async image processing |
| **Email** | Resend | Transactional emails |
| **ML Inference** | Replicate API | MegaDetector + Re-ID models |
| **Hosting** | Vercel | Frontend + API routes |
| **Analytics** | PostHog | Product analytics |
| **Error Tracking** | Sentry | Error monitoring |

---

## 2. User Roles

TineSight supports collaborative deer tracking with role-based access control.

### 2.1 Role Definitions

| Role | Description | Capabilities |
|------|-------------|--------------|
| **Owner** | Account creator, full admin | Upload images, process photos, manage cameras, invite team members, manage subscription, view analytics, delete data |
| **Viewer/Trainer** | Invited collaborator | View photos, confirm/reject deer matches (train model), add notes to deer profiles, view deer catalog |

### 2.2 Role Permissions Matrix

| Feature | Owner | Viewer |
|---------|-------|--------|
| View photos | ✅ | ✅ |
| View deer catalog | ✅ | ✅ |
| Confirm/reject deer matches | ✅ | ✅ |
| Add notes to deer | ✅ | ✅ |
| Upload images | ✅ | ❌ |
| Process images | ✅ | ❌ |
| Manage cameras | ✅ | ❌ |
| Invite team members | ✅ | ❌ |
| Manage subscription | ✅ | ❌ |
| Delete images/deer | ✅ | ❌ |

### 2.3 Mobile Experience

- **Desktop (Owner)**: Full functionality including image upload and processing
- **Mobile (Both roles)**: View photos, review queue, deer catalog - optimized for field use
- **MVP Note**: Photo upload and processing is desktop-only in MVP phase

---

## 3. Authentication & Users

### 3.1 Auth Provider: Supabase Auth

**Login Methods to Implement:**
- [ ] Email + Password
- [ ] Magic Link (passwordless)
- [ ] Google OAuth
- [ ] (Optional) Apple OAuth

### 3.2 Auth Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Login     │────▶│  Supabase   │────▶│  Callback   │
│   Page      │     │    Auth     │     │   /auth/    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Dashboard  │
                                        │   (authed)  │
                                        └─────────────┘
```

### 3.3 Required Pages/Routes

| Route | Purpose |
|-------|---------|
| `/login` | Sign in page |
| `/signup` | Registration page |
| `/auth/callback` | OAuth callback handler |
| `/auth/confirm` | Email confirmation handler |
| `/forgot-password` | Password reset request |
| `/reset-password` | Password reset form |

### 3.4 Middleware Protection

```typescript
// middleware.ts - Protect authenticated routes
export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*', '/api/protected/:path*']
}
```

---

## 4. Payments & Subscriptions

### 4.1 Stripe Integration

**Required Stripe Products:**

| Tier | Price | Limits |
|------|-------|--------|
| **Free** | $0/mo | 100 images/month, 1 camera |
| **Pro** | $9.99/mo | 2,000 images/month, 5 cameras |
| **Ranch** | $29.99/mo | 10,000 images/month, unlimited cameras |

### 4.2 Stripe Webhooks to Handle

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create subscription record |
| `customer.subscription.updated` | Update tier/status |
| `customer.subscription.deleted` | Downgrade to free |
| `invoice.payment_failed` | Notify user, grace period |
| `invoice.paid` | Reset monthly usage counter |

### 4.3 Required API Routes

| Route | Purpose |
|-------|---------|
| `/api/stripe/create-checkout` | Generate Stripe Checkout session |
| `/api/stripe/create-portal` | Generate customer portal link |
| `/api/stripe/webhook` | Handle Stripe webhook events |

### 4.4 Usage Metering

Track per billing cycle:
- Images processed
- AI inference calls
- Storage used (GB)

---

## 5. Database Schema

### 5.1 Core Tables

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

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

-- Team members for collaboration (Owner invites Viewers)
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- The owner's profile
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,    -- The invited user
  role TEXT NOT NULL DEFAULT 'viewer', -- 'owner', 'viewer'
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(account_id, user_id)
);

-- Stripe subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status TEXT, -- active, canceled, past_due, etc.
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  billing_period_start DATE,
  images_processed INTEGER DEFAULT 0,
  storage_used_bytes BIGINT DEFAULT 0,
  ai_calls INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, billing_period_start)
);

-- Camera locations
CREATE TABLE cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location_lat DECIMAL(9,6),
  location_lng DECIMAL(9,6),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  deer_id UUID REFERENCES deer(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  representative_image_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deer embeddings for re-identification (pgvector)
CREATE TABLE deer_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deer_id UUID REFERENCES deer(id) ON DELETE CASCADE,
  detection_id UUID REFERENCES detections(id) ON DELETE CASCADE,
  embedding VECTOR(512), -- 512-dim embedding from re-ID model
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity search index
CREATE INDEX ON deer_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### 5.2 Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE deer ENABLE ROW LEVEL SECURITY;
ALTER TABLE deer_embeddings ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has access to an account
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

-- Profiles: Users can view/update own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Team members: Owners can manage, members can view
CREATE POLICY "Owners can manage team" ON team_members
  FOR ALL USING (auth.uid() = account_id);

CREATE POLICY "Members can view their memberships" ON team_members
  FOR SELECT USING (auth.uid() = user_id);

-- Cameras: Owner full access, viewers can view
CREATE POLICY "Owner full access to cameras" ON cameras
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Viewers can view cameras" ON cameras
  FOR SELECT USING (has_account_access(user_id));

-- Images: Owner full access, viewers can view
CREATE POLICY "Owner full access to images" ON images
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Viewers can view images" ON images
  FOR SELECT USING (has_account_access(user_id));

-- Deer: Owner full access, viewers can view and update (for training)
CREATE POLICY "Owner full access to deer" ON deer
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Viewers can view deer" ON deer
  FOR SELECT USING (has_account_access(user_id));

CREATE POLICY "Viewers can update deer notes" ON deer
  FOR UPDATE USING (has_account_access(user_id))
  WITH CHECK (has_account_access(user_id));

-- Detections: Viewers can update deer_id (for confirming matches)
CREATE POLICY "Owner full access to detections" ON detections
  FOR ALL USING (
    auth.uid() = (SELECT user_id FROM images WHERE id = image_id)
  );

CREATE POLICY "Viewers can view and update detections" ON detections
  FOR SELECT USING (
    has_account_access((SELECT user_id FROM images WHERE id = image_id))
  );

CREATE POLICY "Viewers can confirm deer matches" ON detections
  FOR UPDATE USING (
    has_account_access((SELECT user_id FROM images WHERE id = image_id))
  );
```

---

## 6. File Storage

### 6.1 Supabase Storage Buckets

| Bucket | Purpose | Public |
|--------|---------|--------|
| `camera-images` | Original uploaded photos | No |
| `thumbnails` | Processed thumbnails | No |
| `deer-crops` | Cropped antler regions | No |
| `avatars` | User profile pictures | Yes |

### 6.2 Storage Policies

```sql
-- Users can upload to their own folder
CREATE POLICY "Users can upload own images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'camera-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can view their own images
CREATE POLICY "Users can view own images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'camera-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### 6.3 Upload Flow

```
1. Client requests signed upload URL from API
2. API generates Supabase signed URL
3. Client uploads directly to Supabase Storage
4. Client notifies API of successful upload
5. API queues image for processing
```

---

## 7. Background Jobs & Queues

### 7.1 Recommended: Trigger.dev

**Why Trigger.dev:**
- Works seamlessly with Vercel
- Generous free tier (10,000 runs/month)
- Built-in retries and error handling
- Dashboard for monitoring jobs

### 7.2 Jobs to Implement

| Job | Trigger | Purpose |
|-----|---------|---------|
| `processImage` | On upload | Run MegaDetector, save results |
| `batchProcess` | Manual/scheduled | Process multiple images |
| `generateEmbedding` | After deer detection | Create re-ID embedding |
| `sendEmail` | Various events | Transactional emails |
| `resetUsage` | Cron (monthly) | Reset usage counters |

### 7.3 Example Job Structure

```typescript
// trigger/processImage.ts
import { task } from "@trigger.dev/sdk/v3";

export const processImage = task({
  id: "process-image",
  run: async (payload: { imageId: string; userId: string }) => {
    // 1. Get image from Supabase
    // 2. Call Replicate MegaDetector API
    // 3. Save detection results to database
    // 4. Update image status
    // 5. If deer detected, queue embedding generation
  },
});
```

---

## 8. Email & Notifications

### 8.1 Email Provider: Resend

**Why Resend:**
- Great developer experience
- React Email support
- Generous free tier (3,000 emails/month)
- Built by Vercel alumni

### 8.2 Email Templates Needed

| Template | Trigger |
|----------|---------|
| Welcome | New user signup |
| Email Verification | Account creation |
| Password Reset | Forgot password request |
| Processing Complete | Batch job finished |
| Weekly Digest | Cron (weekly) |
| Subscription Confirmation | New subscription |
| Payment Failed | Stripe webhook |

### 8.3 Setup with React Email

```bash
npm install resend @react-email/components
```

---

## 9. Analytics & Monitoring

### 9.1 Product Analytics: PostHog

**Events to Track:**
- User signup/login
- Image upload
- Processing started/completed
- Deer identified/confirmed
- Subscription upgraded/downgraded

### 9.2 Error Tracking: Sentry

```bash
npm install @sentry/nextjs
```

**Configure for:**
- Client-side errors
- Server-side errors (API routes)
- Edge middleware errors

### 9.3 Performance Monitoring

- Vercel Analytics (built-in)
- Vercel Speed Insights
- Core Web Vitals tracking

---

## 10. Core UI Components

### 10.1 shadcn/ui Components to Install

```bash
npx shadcn-ui@latest init

# Core components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add label
npx shadcn-ui@latest add select
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add progress
npx shadcn-ui@latest add skeleton
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add slider
npx shadcn-ui@latest add checkbox
npx shadcn-ui@latest add form
npx shadcn-ui@latest add table
```

### 10.2 Additional Libraries

```bash
# Forms
npm install react-hook-form zod @hookform/resolvers

# Data fetching
npm install @tanstack/react-query

# State management
npm install zustand

# Date handling
npm install date-fns

# Icons
npm install lucide-react
```

---

## 11. Environment Variables

### 11.1 Required Variables

```env
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx

# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_PRICE_PRO=price_xxxxx
STRIPE_PRICE_RANCH=price_xxxxx

# Replicate (AI)
REPLICATE_API_TOKEN=r8_xxxxx

# Trigger.dev (Background Jobs)
TRIGGER_API_KEY=tr_dev_xxxxx
TRIGGER_API_URL=https://api.trigger.dev

# Resend (Email)
RESEND_API_KEY=re_xxxxx

# PostHog (Analytics)
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Sentry (Error Tracking)
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 12. Project Structure

```
tinesight/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── signup/
│   │   │   └── page.tsx
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── photos/
│   │   │   └── page.tsx
│   │   ├── deer/
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   └── page.tsx
│   │   ├── cameras/
│   │   │   └── page.tsx
│   │   ├── review/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── route.ts
│   │   ├── stripe/
│   │   │   ├── create-checkout/
│   │   │   │   └── route.ts
│   │   │   ├── create-portal/
│   │   │   │   └── route.ts
│   │   │   └── webhook/
│   │   │       └── route.ts
│   │   ├── images/
│   │   │   ├── upload/
│   │   │   │   └── route.ts
│   │   │   └── process/
│   │   │       └── route.ts
│   │   └── deer/
│   │       └── match/
│   │           └── route.ts
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── ui/                    # shadcn components
│   ├── auth/
│   │   ├── login-form.tsx
│   │   ├── signup-form.tsx
│   │   └── user-button.tsx
│   ├── dashboard/
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   └── stats-cards.tsx
│   ├── photos/
│   │   ├── photo-grid.tsx
│   │   ├── photo-card.tsx
│   │   └── upload-zone.tsx
│   ├── deer/
│   │   ├── deer-card.tsx
│   │   ├── deer-profile.tsx
│   │   └── match-modal.tsx
│   └── shared/
│       ├── loading.tsx
│       └── error-boundary.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts          # Browser client
│   │   ├── server.ts          # Server client
│   │   └── middleware.ts      # Auth middleware helper
│   ├── stripe/
│   │   ├── client.ts
│   │   └── webhooks.ts
│   ├── replicate/
│   │   └── megadetector.ts
│   ├── utils.ts
│   └── constants.ts
├── hooks/
│   ├── use-user.ts
│   ├── use-subscription.ts
│   └── use-images.ts
├── stores/
│   └── app-store.ts           # Zustand store
├── trigger/
│   ├── process-image.ts
│   ├── generate-embedding.ts
│   └── send-email.ts
├── emails/
│   ├── welcome.tsx
│   ├── processing-complete.tsx
│   └── weekly-digest.tsx
├── types/
│   ├── database.ts            # Generated Supabase types
│   └── index.ts
├── public/
│   └── logo.svg
├── .env.local
├── .env.example
├── middleware.ts
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 13. Setup Checklist

### Phase 1: Project Foundation

- [ ] Create Next.js 14 project with TypeScript
- [ ] Install and configure TailwindCSS
- [ ] Set up shadcn/ui
- [ ] Configure ESLint and Prettier
- [ ] Create basic project structure
- [ ] Set up environment variables

### Phase 2: Supabase Setup

- [ ] Create Supabase project
- [ ] Run database migrations (create tables)
- [ ] Enable pgvector extension
- [ ] Configure RLS policies
- [ ] Create storage buckets
- [ ] Set up storage policies
- [ ] Generate TypeScript types

### Phase 3: Authentication

- [ ] Install Supabase client libraries
- [ ] Create auth middleware
- [ ] Build login page
- [ ] Build signup page
- [ ] Implement OAuth (Google)
- [ ] Create password reset flow
- [ ] Add user profile management

### Phase 4: Stripe Integration

- [ ] Create Stripe account
- [ ] Set up products and prices
- [ ] Implement checkout session API
- [ ] Implement customer portal API
- [ ] Set up webhook endpoint
- [ ] Handle subscription events
- [ ] Build pricing page
- [ ] Add subscription management UI

### Phase 5: Background Jobs

- [ ] Set up Trigger.dev account
- [ ] Configure Trigger.dev in project
- [ ] Create image processing job
- [ ] Create embedding generation job
- [ ] Create email sending job
- [ ] Test job execution

### Phase 6: Email

- [ ] Set up Resend account
- [ ] Configure domain verification
- [ ] Create email templates with React Email
- [ ] Implement welcome email
- [ ] Implement transactional emails

### Phase 7: Analytics & Monitoring

- [ ] Set up PostHog
- [ ] Add event tracking
- [ ] Set up Sentry
- [ ] Configure error boundaries
- [ ] Add Vercel Analytics

### Phase 8: Core UI

- [ ] Build dashboard layout
- [ ] Create sidebar navigation
- [ ] Implement stats cards
- [ ] Build photo gallery component
- [ ] Create upload interface
- [ ] Build deer catalog UI

### Phase 9: AI Integration

- [ ] Set up Replicate account
- [ ] Implement MegaDetector API calls
- [ ] Build processing queue UI
- [ ] Create review queue for AI suggestions
- [ ] Implement deer matching logic

### Phase 10: Polish & Launch

- [ ] Mobile responsive testing
- [ ] Performance optimization
- [ ] SEO meta tags
- [ ] Create landing page
- [ ] Write documentation
- [ ] Deploy to production

---

## Quick Start Commands

```bash
# Create project
npx create-next-app@latest tinesight --typescript --tailwind --eslint --app --src-dir=false

# Navigate to project
cd tinesight

# Install core dependencies
npm install @supabase/supabase-js @supabase/ssr
npm install stripe @stripe/stripe-js
npm install @tanstack/react-query
npm install zustand
npm install react-hook-form zod @hookform/resolvers
npm install date-fns
npm install lucide-react

# Install shadcn/ui
npx shadcn-ui@latest init

# Generate Supabase types
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.ts

# Run development server
npm run dev
```

---

## Resources

- [Next.js 14 Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Stripe Documentation](https://stripe.com/docs)
- [Trigger.dev Documentation](https://trigger.dev/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Resend Documentation](https://resend.com/docs)
- [TanStack Query](https://tanstack.com/query)
- [Zustand](https://zustand-demo.pmnd.rs/)

---

*Document Version 1.0 — December 2025*
*TineSight Project Setup Requirements*