# Implementation Plan: Minimal SaaS Foundation

**Branch**: `001-saas-foundation` | **Date**: 2025-12-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-saas-foundation/spec.md`

## Summary

Implement the foundational SaaS infrastructure for TineSight including user authentication (signup, login, password reset), database schema with Row-Level Security, and a protected dashboard layout with navigation. Uses Next.js 14 App Router with Supabase for auth and database.

## Technical Context

**Language/Version**: TypeScript 5.x with Next.js 14 (App Router)
**Primary Dependencies**: @supabase/supabase-js, @supabase/ssr, shadcn/ui, TailwindCSS, lucide-react
**Storage**: PostgreSQL via Supabase (managed) with pgvector extension
**Testing**: Manual integration testing via checklist (unit tests deferred per constitution)
**Target Platform**: Web (Vercel deployment), responsive but desktop-primary
**Project Type**: Web application (single Next.js project with API routes)
**Performance Goals**: Login/signup < 10 seconds, page navigation < 200ms
**Constraints**: Serverless-only (Vercel + Supabase), RLS required on all tables
**Scale/Scope**: Single user testing, ~10 tables, 15 pages/components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Implementation |
|-----------|--------|----------------|
| I. Serverless-First | ✅ Pass | Vercel (compute) + Supabase (DB/Auth) - no self-managed infra |
| II. Human-in-the-Loop AI | ✅ N/A | No AI in this feature (foundation only) |
| III. Multi-Tenant Data Isolation | ✅ Pass | RLS policies on all tables with `auth.uid()` checks |
| IV. Role-Based Access Control | ✅ Pass | Schema includes team_members with owner/viewer roles |
| V. Integration Testing | ✅ Pass | Manual checklist for user flows; unit tests deferred |
| VI. Phased Delivery | ✅ Pass | 5 user stories prioritized P1-P3, independently testable |
| VII. Design System Compliance | ✅ Pass | shadcn/ui + TailwindCSS with TineSight color palette |

**Gate Status**: ✅ All principles satisfied. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-saas-foundation/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
│   └── auth-api.yaml
├── checklists/
│   └── requirements.md  # Spec validation checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
app/
├── (auth)/                      # Auth route group (public)
│   ├── layout.tsx               # Centered auth layout
│   ├── login/page.tsx           # Login page
│   ├── signup/page.tsx          # Signup page
│   └── forgot-password/page.tsx # Password reset request
├── (dashboard)/                 # Dashboard route group (protected)
│   ├── layout.tsx               # Dashboard layout with sidebar/header
│   ├── dashboard/page.tsx       # Main dashboard
│   ├── photos/page.tsx          # Placeholder
│   ├── deer/page.tsx            # Placeholder
│   ├── cameras/page.tsx         # Placeholder
│   └── settings/page.tsx        # User settings
├── auth/
│   └── callback/route.ts        # OAuth/magic link callback
├── globals.css                  # Global styles with design system
├── layout.tsx                   # Root layout
└── page.tsx                     # Landing page (redirects)

components/
├── auth/
│   ├── login-form.tsx           # Login form component
│   ├── signup-form.tsx          # Signup form component
│   └── forgot-password-form.tsx # Password reset form
├── dashboard/
│   ├── sidebar.tsx              # Navigation sidebar
│   └── header.tsx               # Top header with user menu
└── ui/                          # shadcn/ui components

lib/
├── supabase/
│   ├── client.ts                # Browser client
│   ├── server.ts                # Server component client
│   └── middleware.ts            # Auth middleware helper
└── utils.ts                     # Utility functions

types/
├── database.ts                  # Generated Supabase types
└── index.ts                     # Type exports

supabase/
└── migrations/
    └── 001_initial_schema.sql   # Complete schema + RLS

middleware.ts                    # Next.js middleware (route protection)
tailwind.config.ts               # TineSight design system colors
```

**Structure Decision**: Single Next.js project using App Router route groups. `(auth)` for public authentication pages, `(dashboard)` for protected application pages. Supabase handles all backend concerns (auth, database, storage).

## Complexity Tracking

> No constitution violations. All design choices follow principles.

| Decision | Rationale | Alternative Considered |
|----------|-----------|------------------------|
| Single Next.js project | Simplest for MVP, serverless-compatible | Separate frontend/backend - unnecessary complexity |
| Supabase SSR pattern | Official recommended approach for Next.js 14 | Auth helpers deprecated, custom JWT - more work |
| Route groups for auth/dashboard | Clean URL structure, shared layouts | Separate auth app - overkill |
