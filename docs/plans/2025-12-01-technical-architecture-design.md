# Technical Architecture Design

**Date**: 2025-12-01
**Status**: Approved
**Scope**: Tech stack, data patterns, infrastructure decisions

## Summary

This document captures architectural decisions for TineSight's MVP implementation, filling gaps in the original constitution and validating the core stack.

---

## Complete Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Next.js 14 (App Router) | Full-stack React, serverless |
| **Language** | TypeScript 5.x | Type safety |
| **Styling** | TailwindCSS + shadcn/ui | Design system |
| **Database** | Supabase PostgreSQL + pgvector | Managed DB, vector search |
| **Auth** | Supabase Auth | Email/OAuth sessions |
| **Storage** | Supabase Storage | Image files |
| **Background Jobs** | Trigger.dev | Async photo/AI processing |
| **ML Inference** | Replicate API | MegaDetector + re-ID model |
| **Hosting** | Vercel | Serverless deployment |
| **Data Fetching** | TanStack Query | Cache, mutations (interactive flows) |
| **Client State** | Zustand | UI state, selections |
| **Forms** | React Hook Form + Zod | Validation, type-safe |
| **E2E Testing** | Playwright | User flow tests (CI) |
| **Unit Testing** | Vitest | Complex logic only |

---

## Project Structure

```
app/
├── (auth)/                      # Public auth pages
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   └── forgot-password/page.tsx
├── (dashboard)/                 # Protected pages
│   ├── layout.tsx               # Sidebar + header shell
│   ├── dashboard/page.tsx
│   ├── photos/page.tsx
│   ├── deer/page.tsx
│   ├── cameras/page.tsx
│   └── settings/page.tsx
├── auth/callback/route.ts       # OAuth callback
├── layout.tsx                   # Root layout
└── globals.css

components/
├── auth/                        # Auth forms
├── dashboard/                   # Sidebar, header
├── photos/                      # Upload, grid, viewer
├── deer/                        # Catalog, profile, matcher
└── ui/                          # shadcn/ui primitives

lib/
├── supabase/
│   ├── client.ts                # Browser client
│   ├── server.ts                # Server Component client
│   └── middleware.ts            # Auth helper
├── services/                    # Data access layer
│   ├── auth.ts
│   ├── photos.ts
│   ├── deer.ts
│   └── detections.ts
├── stores/                      # Zustand stores
│   ├── photo-selection.ts
│   └── ui.ts
└── utils.ts

types/
├── database.ts                  # Generated Supabase types
└── index.ts

trigger/
├── jobs/
│   ├── process-photo.ts
│   ├── generate-embedding.ts
│   └── batch-process.ts
└── client.ts

tests/
├── e2e/                         # Playwright (run in CI)
│   ├── auth.spec.ts
│   ├── photos.spec.ts
│   └── deer.spec.ts
├── integration/
│   └── services/
│       ├── deer.test.ts
│       └── photos.test.ts
└── setup.ts

supabase/migrations/             # SQL migrations
middleware.ts                    # Route protection
```

---

## Data Flow Patterns

### Server Components (default)

```
Page (Server) → Service → Supabase → Render HTML
```

Used for: Dashboard, deer catalog, photo grid initial load, settings

### Client Mutations (interactive flows)

```
User Action → TanStack Mutation → Service → Supabase → Cache Invalidate → Re-render
```

Used for: Photo upload, deer assignment, match confirmation

### Real-time Updates

```
Supabase Realtime → TanStack Query refetch → UI Update
```

Used for: Upload progress, AI processing status (start with polling, upgrade to Realtime if needed)

### Service Layer Pattern

Components never call Supabase directly. All data access through service functions:

```typescript
// lib/services/deer.ts
export async function getDeerByUser(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('deer')
    .select('*, detections(count)')
    .order('last_seen', { ascending: false });

  if (error) throw error;
  return data;
}
```

---

## Authentication & Authorization

### Auth Flow

```
Login → Supabase Auth → Cookie Session → middleware.ts validates → Protected routes
```

### Authorization Layers

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| Route | Next.js middleware | Redirect to login if no session |
| API | `getUser()` check | Verify session before mutations |
| Database | RLS policies | Data isolation (defense in depth) |

### Role Enforcement

```typescript
// lib/services/auth.ts
export async function requireOwnerRole(supabase: SupabaseClient, accountId: string) {
  const { data } = await supabase
    .from('team_members')
    .select('role')
    .eq('account_id', accountId)
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
    .single();

  if (data?.role !== 'owner') throw new Error('Forbidden');
}
```

Server-side enforcement required. Client hides UI, server enforces rules.

---

## Background Job Architecture

### Job Flow

```
Upload Complete → Trigger Job → Replicate API → Save Results → Notify UI
```

### Jobs

| Job | Trigger | Purpose |
|-----|---------|---------|
| `process-photo` | Photo uploaded | Call MegaDetector, save detections |
| `generate-embedding` | Detection created | Call re-ID model, store in pgvector |
| `batch-process` | Batch upload done | Fan out to individual photo jobs |

### Status Updates

Use polling initially (simpler):

```typescript
const { data } = useQuery({
  queryKey: ['photo', photoId],
  refetchInterval: (data) => data?.status === 'processing' ? 2000 : false
});
```

Upgrade to Supabase Realtime if polling feels sluggish.

### Error Handling

- Jobs retry 3x with exponential backoff
- Failed jobs marked as `status: 'error'` with message
- User sees "Processing failed" with retry button

---

## Error Handling Strategy

### Three Layers

| Layer | Approach | User Experience |
|-------|----------|-----------------|
| **Forms** | Zod validation + React Hook Form | Inline field errors |
| **Services** | Try/catch, typed errors | Toast notifications |
| **Global** | Next.js error boundaries | Fallback UI with retry |

### Typed Service Errors

```typescript
// lib/services/errors.ts
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION' | 'NETWORK'
  ) {
    super(message);
  }
}
```

---

## Testing Strategy

### Approach

Per Constitution: Integration tests over unit tests. Focus on user flows.

| Tool | Purpose |
|------|---------|
| **Playwright** | E2E user flows (run in CI) |
| **Vitest** | Unit tests for complex logic |
| **Testing Library** | Component integration tests |

### Local Testing (WSL Workaround)

WSL2 doesn't support headed browsers reliably. Solutions:

1. **Trace Viewer** for debugging:
   ```typescript
   // playwright.config.ts
   use: { trace: 'on-first-retry' }
   ```
   Then: `npx playwright show-trace trace.zip`

2. **E2E runs in GitHub Actions** — CI has full browser support

### Test Database

- Separate Supabase project for testing
- Migrations applied before test runs
- Data reset between test suites

### What We Skip

- Mocking Supabase (test against real DB)
- Unit testing simple CRUD
- Snapshot tests

---

## Dependencies Summary

**New packages to install:**

```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.x",
    "zustand": "^4.x",
    "react-hook-form": "^7.x",
    "zod": "^3.x",
    "@hookform/resolvers": "^3.x"
  },
  "devDependencies": {
    "@playwright/test": "^1.x",
    "vitest": "^1.x",
    "@testing-library/react": "^14.x"
  }
}
```

---

## Revision History

| Date | Change |
|------|--------|
| 2025-12-01 | Initial design approved |
