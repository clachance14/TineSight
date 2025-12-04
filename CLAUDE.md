# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Vision

**TineSight** helps hunting lease operators build a catalog of trophy bucks using AI-powered re-identification, enabling them to attract and close lease deals.

| Aspect | Detail |
|--------|--------|
| **Problem** | Volume overwhelm (1000s of photos) + Can't track individual bucks |
| **Target User** | Hunting lease operator (commercial hunting operation) |
| **Differentiator** | AI buck re-identification - "This is the same buck from last week" |
| **North Star Metric** | First Buck Re-Identified |

See `.specify/memory/product-vision.md` for complete problem definition, user journey, and success metrics.

## Project Status

TineSight is a **specification-first project** currently in the planning phase. Complete specifications exist for the MVP foundation, but source code has not yet been implemented. Start implementation with `/speckit.implement`.

## Commands

Once the project is initialized:

```bash
npm run dev          # Start development server at localhost:3000
npm run build        # Production build
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
```

Database operations:
```bash
npx supabase login                                    # Authenticate with Supabase
npx supabase link --project-ref <ref>                # Link to project
npx supabase gen types typescript --linked > types/database.ts  # Generate types
```

Trigger.dev (v3/v4):
```bash
npx trigger.dev@latest dev         # Start local Trigger.dev worker
# Config: trigger.config.ts | Jobs: ./trigger/
# Note: `npx trigger dev` and `npx @trigger.dev/cli dev` are WRONG commands
```

Utility scripts (in `scripts/`):
```bash
node scripts/cleanup-orphans.mjs   # Delete failed images
node scripts/check-replicate.mjs   # Verify Replicate API status
node scripts/retry-failed.mjs      # Reset failed images and retry
node scripts/trigger-batch.mjs     # Trigger batch processing
```

## Architecture

### Stack
- **Framework**: Next.js 14 (App Router) with TypeScript 5.x
- **Styling**: TailwindCSS + shadcn/ui
- **Database**: PostgreSQL via Supabase with pgvector extension
- **Auth**: Supabase Auth (email, OAuth, magic link)
- **Storage**: Supabase Storage (images)
- **Background Jobs**: Trigger.dev (async processing)
- **ML Inference**: Replicate API (MegaDetector + re-ID)
- **Hosting**: Vercel (serverless)
- **Data Fetching**: TanStack Query (interactive flows)
- **Client State**: Zustand (UI state, selections)
- **Forms**: React Hook Form + Zod
- **Testing**: Playwright (E2E in CI), Vitest (unit)

See `docs/plans/2025-12-01-technical-architecture-design.md` for complete architecture decisions.

### Project Structure (planned)
```
app/
├── (auth)/           # Public auth pages (login, signup, forgot-password)
├── (dashboard)/      # Protected pages (dashboard, photos, deer, cameras, settings)
├── auth/callback/    # OAuth/magic link callback handler
└── globals.css       # Design system styles

components/
├── auth/             # Auth form components
├── dashboard/        # Sidebar, header
├── photos/           # Upload, grid, viewer
├── deer/             # Catalog, profile, matcher
└── ui/               # shadcn/ui components

lib/
├── supabase/
│   ├── client.ts     # Browser client
│   ├── server.ts     # Server component client
│   └── middleware.ts # Auth helper
├── services/         # Data access layer (auth, photos, deer, detections)
├── stores/           # Zustand stores (photo-selection, ui)
└── utils.ts

trigger/
└── jobs/             # Background jobs (process-photo, generate-embedding)

scripts/
├── env.mjs           # Dotenv loader for .env.local
├── cleanup-orphans.mjs
├── check-replicate.mjs
├── retry-failed.mjs
└── trigger-batch.mjs

tests/
├── e2e/              # Playwright (run in CI)
└── integration/      # Service tests

middleware.ts         # Route protection
```

### Key Patterns

**Service Layer**: Components never call Supabase directly. Use `lib/services/*.ts` for all data access.

**Data Flow**: Server Components for initial load, TanStack Query for client mutations/cache.

**Supabase SSR Auth**: Use `@supabase/ssr` with cookie-based sessions. Always use `getUser()` for server-side auth checks (NOT `getSession()` - deprecated).

**Route Protection**: `middleware.ts` at project root handles auth redirects. Protected routes in `(dashboard)/` group.

**Row-Level Security**: REQUIRED on all tables. Use `auth.uid()` for ownership checks. Use `has_account_access()` helper for team member access.

**Utility Scripts**: Scripts in `scripts/` use dotenv for env loading. Pattern:
```javascript
import './env.mjs'  // Loads .env.local via dotenv
// Then use process.env.VAR_NAME
```

## Constitution Principles

All code must comply with these principles (see `.specify/memory/constitution.md` for full details):

1. **Serverless-First** - Managed services only (Vercel, Supabase). No self-managed infrastructure.
2. **Human-in-the-Loop AI** - AI suggestions require user confirmation. No autonomous actions on critical data.
3. **Multi-Tenant Data Isolation** - RLS on every table. Cross-tenant access must be impossible.
4. **Role-Based Access Control** - Owner vs Viewer roles. Server-side enforcement required.
5. **Integration Testing Over Unit Testing** - Prioritize user flow tests over unit coverage.
6. **Phased Delivery** - Independent user stories (P1, P2, P3 priority).
7. **Design System Compliance** - Dark mode default. Use TineSight color palette.

## Design System

**Colors** (extend in `tailwind.config.ts`):
- `slate-deep` (#2D3638) - Primary background
- `slate` (#3D4A4D) - Elevated surfaces
- `copper` (#C4895A) - Primary accent/CTAs
- `copper-light` (#D49A6A) - Hover states
- `cream` (#F5F0E8) - Primary text
- `cream-dark` (#E8E3DB) - Secondary text

**Typography**: Inter (sans), JetBrains Mono (monospace)

**Components**: Use shadcn/ui with TineSight theme customizations

## Development Workflow

Use speckit commands for feature development:

1. `/speckit.specify` - Create feature specification
2. `/speckit.plan` - Generate implementation plan
3. `/speckit.tasks` - Generate actionable task list
4. `/speckit.implement` - Execute tasks

## Key Reference Documents

- **Product Vision**: `.specify/memory/product-vision.md` (problem, users, metrics, journey)
- **Constitution**: `.specify/memory/constitution.md` (principles, tech stack, governance)
- **Architecture Design**: `docs/plans/2025-12-01-technical-architecture-design.md` (complete tech decisions)
- **Feature Spec**: `specs/001-saas-foundation/spec.md`
- **Implementation Plan**: `specs/001-saas-foundation/plan.md`
- **Data Model**: `specs/001-saas-foundation/data-model.md`
- **Tasks**: `specs/001-saas-foundation/tasks.md`
- **Quickstart**: `specs/001-saas-foundation/quickstart.md`
- **API Contract**: `specs/001-saas-foundation/contracts/auth-api.yaml`

## Environment Variables

Copy `.env.example` to `.env.local` and configure:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Server-only service role key

## Active Technologies
- TypeScript 5.x (strict mode) + Next.js 14 (App Router), React 18, TanStack Query, Trigger.dev, Sharp (image processing) (003-roi-quality-filter)
- PostgreSQL via Supabase with pgvector extension, Supabase Storage for images (003-roi-quality-filter)

## Recent Changes
- 003-roi-quality-filter: Added TypeScript 5.x (strict mode) + Next.js 14 (App Router), React 18, TanStack Query, Trigger.dev, Sharp (image processing)
