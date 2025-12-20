# Implementation Plan: Minimal SaaS Foundation

**Branch**: `001-saas-foundation` | **Date**: 2025-12-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-saas-foundation/spec.md`

## Summary

Implement the foundational SaaS infrastructure for TineSight including authentication (signup, login, logout, password reset), database schema with RLS policies, and dashboard navigation shell. Uses Next.js 14 App Router with Supabase for auth and database, following the serverless-first architecture principle.

## Technical Context

**Language/Version**: TypeScript 5.x with Next.js 14 (App Router)
**Primary Dependencies**: @supabase/ssr, @supabase/supabase-js, TailwindCSS, shadcn/ui, Zustand, TanStack Query, React Hook Form, Zod
**Storage**: PostgreSQL via Supabase with pgvector extension
**Testing**: Manual integration testing via quickstart.md (Playwright E2E deferred to Phase 2)
**Target Platform**: Web (Vercel serverless deployment)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Dashboard load <10 seconds, auth flows <3 minutes end-to-end
**Constraints**: Serverless-only (no self-managed infrastructure per Constitution I)
**Scale/Scope**: Single-tenant MVP, 5 dashboard pages, 4 auth flows

## Constitution Check

*GATE: Passed - All principles verified*

| Principle | Status | Implementation |
|-----------|--------|----------------|
| I. Serverless-First | ✅ | Vercel (hosting), Supabase (DB/Auth/Storage) |
| II. Human-in-the-Loop AI | ✅ N/A | No AI in this feature |
| III. Multi-Tenant Data Isolation | ✅ | RLS on all tables, `auth.uid()` checks |
| IV. Role-Based Access Control | ✅ | team_members table with owner/viewer roles |
| V. Integration Testing | ✅ | Manual quickstart.md validation; automated E2E deferred |
| VI. Phased Delivery | ✅ | 5 user stories (P1-P3), independently testable |
| VII. Design System Compliance | ✅ | TineSight palette in Tailwind, shadcn/ui components |

## Project Structure

### Documentation (this feature)

```text
specs/001-saas-foundation/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Technical decisions
├── data-model.md        # Database schema
├── quickstart.md        # Setup and validation guide
├── contracts/           # API contracts
│   └── auth-api.yaml
└── tasks.md             # Implementation tasks
```

### Source Code (repository root)

```text
app/
├── (auth)/              # Public auth pages
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
├── (dashboard)/         # Protected dashboard pages
│   ├── layout.tsx
│   ├── dashboard/page.tsx
│   ├── photos/page.tsx
│   ├── deer/page.tsx
│   ├── cameras/page.tsx
│   └── settings/page.tsx
├── auth/callback/route.ts
├── globals.css
├── layout.tsx
└── page.tsx

components/
├── auth/                # Auth form components
├── dashboard/           # Sidebar, header
└── ui/                  # shadcn/ui components

lib/
├── supabase/
│   ├── client.ts        # Browser client
│   ├── server.ts        # Server component client
│   └── middleware.ts    # Auth helper
├── services/            # Data access layer
│   ├── auth.ts
│   └── profile.ts
├── stores/              # Zustand stores
│   └── ui.ts
├── query-client.ts
└── utils.ts

types/
├── database.ts          # Supabase generated types
└── index.ts

supabase/
└── migrations/
    └── 001_initial_schema.sql

middleware.ts            # Route protection
```

**Structure Decision**: Next.js 14 App Router with route groups `(auth)` and `(dashboard)` for layout separation. Service layer pattern for data access. Supabase SSR pattern with cookie-based sessions.

## Complexity Tracking

> No constitution violations requiring justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *None* | — | — |
