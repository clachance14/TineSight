# Tasks: Minimal SaaS Foundation

**Input**: Design documents from `/specs/001-saas-foundation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/auth-api.yaml

**Tests**: No automated tests in this phase. Per Constitution V, "working user flows are the metric" - manual integration testing via quickstart.md checklist satisfies this requirement. Automated E2E tests (Playwright) will be added in Phase 2 (photo-pipeline) when CI infrastructure is established.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Initialize Next.js 14 project with TypeScript, Tailwind, ESLint, App Router in repository root
- [ ] T002 Install core dependencies: @supabase/supabase-js, @supabase/ssr, lucide-react, @tanstack/react-query, zustand, react-hook-form, zod, @hookform/resolvers
- [ ] T003 Install dev dependencies: supabase CLI
- [ ] T004 Initialize shadcn/ui with default style, slate base color, CSS variables
- [ ] T005 Install shadcn/ui components: button, card, input, label, form, avatar, dropdown-menu, separator
- [ ] T006 [P] Create .env.local with Supabase environment variables template
- [ ] T007 [P] Create .env.example documenting required environment variables

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

### Database & Types

- [ ] T008 Create database migration supabase/migrations/001_initial_schema.sql with all tables (profiles, team_members, cameras, images, deer, detections, deer_embeddings)
- [ ] T009 Add RLS policies to 001_initial_schema.sql for all tables using auth.uid() checks
- [ ] T010 Add has_account_access() helper function to 001_initial_schema.sql
- [ ] T011 Add handle_new_user() trigger function and trigger to 001_initial_schema.sql
- [ ] T012 Create types/database.ts placeholder for Supabase generated types
- [ ] T013 Create types/index.ts to export type definitions

### Supabase Client Utilities

- [ ] T014 [P] Create lib/supabase/client.ts with browser client using createBrowserClient
- [ ] T015 [P] Create lib/supabase/server.ts with server component client using createServerClient
- [ ] T016 [P] Create lib/supabase/middleware.ts with middleware client helper
- [ ] T017 Create lib/utils.ts with cn() utility function for className merging

### Service Layer & State

- [ ] T017a [P] Create lib/services/auth.ts with login, signup, logout, getUser service functions
- [ ] T017b [P] Create lib/services/profile.ts with getProfile, updateProfile service functions
- [ ] T017c [P] Create lib/stores/ui.ts Zustand store for sidebar state, modals
- [ ] T017d Create lib/query-client.ts with QueryClient configuration for TanStack Query

### Middleware & Design System

- [ ] T018 Create middleware.ts at project root with route protection and session refresh
- [ ] T019 Update tailwind.config.ts with TineSight color palette (slate-deep, slate, slate-light, copper, copper-light, cream, cream-dark)
- [ ] T020 Update app/globals.css with TineSight design system CSS variables

### Root Layout & Landing

- [ ] T021 Create app/layout.tsx root layout with metadata, fonts (Inter sans, JetBrains Mono mono per Constitution VII), QueryClientProvider, and global providers
- [ ] T022 Create app/page.tsx landing page that redirects to /dashboard or /login based on auth status

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Account Creation (Priority: P1)

**Goal**: New users can create an account with TineSight to begin using the deer tracking application

**Independent Test**: Navigate to signup page, create account with email/password/name, confirm email, verify access to authenticated area

### Implementation for User Story 1

- [ ] T023 Create app/(auth)/layout.tsx with centered auth layout styling
- [ ] T024 [P] [US1] Create components/auth/signup-form.tsx with email, password, full_name fields and validation
- [ ] T025 [US1] Create app/(auth)/signup/page.tsx with SignupForm component and link to login
- [ ] T026 [US1] Create app/auth/callback/route.ts to handle OAuth/magic link callback and exchange code for session

**Checkpoint**: User Story 1 complete - signup flow functional, email confirmation works

---

## Phase 4: User Story 2 - User Authentication (Priority: P1)

**Goal**: Registered users can log in and log out of TineSight securely

**Independent Test**: Log in with valid credentials, verify dashboard access, sign out, verify redirect to login

### Implementation for User Story 2

- [ ] T027 [P] [US2] Create components/auth/login-form.tsx with email, password fields and validation
- [ ] T028 [US2] Create app/(auth)/login/page.tsx with LoginForm component and links to signup/forgot-password
- [ ] T029 [US2] Add signOut action to header user menu (component created in US4, action added here)

**Checkpoint**: User Stories 1 AND 2 complete - full signup/login/logout flow works

---

## Phase 5: User Story 3 - Password Recovery (Priority: P2)

**Goal**: Users who forget their password can reset it via email

**Independent Test**: Request password reset, receive email, click link, set new password, login with new credentials

### Implementation for User Story 3

- [ ] T030 [P] [US3] Create components/auth/forgot-password-form.tsx with email field and reset request
- [ ] T031 [US3] Create app/(auth)/forgot-password/page.tsx with ForgotPasswordForm component
- [ ] T032 [US3] Create app/(auth)/reset-password/page.tsx to handle password update after reset link click

**Checkpoint**: User Story 3 complete - password reset flow works end-to-end

---

## Phase 6: User Story 4 - Dashboard Navigation (Priority: P2)

**Goal**: Authenticated users can navigate between different sections of the application using a sidebar

**Independent Test**: Login, click each navigation item, verify correct page loads and nav state updates

### Implementation for User Story 4

- [ ] T033 Create app/(dashboard)/layout.tsx with sidebar and header layout structure
- [ ] T034 [P] [US4] Create components/dashboard/sidebar.tsx with navigation items (Dashboard, Photos, Deer, Cameras, Settings)
- [ ] T035 [P] [US4] Create components/dashboard/header.tsx with user dropdown menu (Settings, Sign Out)
- [ ] T036 [US4] Create app/(dashboard)/dashboard/page.tsx main dashboard placeholder
- [ ] T037 [P] [US4] Create app/(dashboard)/photos/page.tsx placeholder page
- [ ] T038 [P] [US4] Create app/(dashboard)/deer/page.tsx placeholder page
- [ ] T039 [P] [US4] Create app/(dashboard)/cameras/page.tsx placeholder page
- [ ] T040 [US4] Create app/(dashboard)/settings/page.tsx settings page shell

**Checkpoint**: User Story 4 complete - navigation between all sections works

---

## Phase 7: User Story 5 - User Profile Display (Priority: P3)

**Goal**: Users can view their profile information on the dashboard and settings page

**Independent Test**: Login, verify name displays in header avatar, verify profile info appears on settings page

### Implementation for User Story 5

- [ ] T041 [US5] Update components/dashboard/header.tsx to fetch and display user initials in avatar
- [ ] T042 [US5] Update app/(dashboard)/settings/page.tsx to display profile section with email, name, subscription tier

**Checkpoint**: All user stories complete - full SaaS foundation functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T043 Apply database migration: run `npx supabase db push` (if linked) OR paste supabase/migrations/001_initial_schema.sql into Supabase Dashboard SQL Editor
- [ ] T044 Generate TypeScript types: npx supabase gen types typescript --local > types/database.ts (requires local Supabase) OR use Supabase Dashboard > API Docs > TypeScript types
- [ ] T045 Run quickstart.md validation checklist manually
- [ ] T046 Verify all RLS policies working correctly
- [ ] T047 Test complete user flow: signup → confirm → login → navigate → settings → logout

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 and US2 are P1 priority (MVP)
  - US3 and US4 are P2 priority
  - US5 is P3 priority
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (Account Creation)**: Requires auth layout, can start after Phase 2
- **User Story 2 (Authentication)**: Can start in parallel with US1, shares auth layout
- **User Story 3 (Password Recovery)**: Independent of US1/US2, uses same auth layout
- **User Story 4 (Dashboard Navigation)**: Independent, creates dashboard shell
- **User Story 5 (Profile Display)**: Depends on US4 header component for avatar update

### Within Each User Story

- Layout/structure before forms
- Forms before pages
- Core implementation before integration

### Parallel Opportunities

**Phase 1 Setup:**
- T006 and T007 can run in parallel (env files)

**Phase 2 Foundational:**
- T014, T015, T016 can run in parallel (different Supabase client files)
- T017a, T017b, T017c can run in parallel (different service/store files)

**Phase 3-7 User Stories:**
- US1 and US2 can run in parallel (both P1, share auth layout created first)
- US3 can run in parallel with US4 (independent)
- T034 and T035 can run in parallel (sidebar and header are different files)
- T037, T038, T039 can run in parallel (placeholder pages are independent)

---

## Parallel Example: Dashboard Layout

```bash
# After T033 (dashboard layout) is complete, launch all navigation components:
Task: "Create sidebar.tsx with navigation items"
Task: "Create header.tsx with user dropdown"

# After layout components complete, launch all placeholder pages:
Task: "Create photos/page.tsx placeholder"
Task: "Create deer/page.tsx placeholder"
Task: "Create cameras/page.tsx placeholder"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Account Creation)
4. Complete Phase 4: User Story 2 (Authentication)
5. **STOP and VALIDATE**: Test signup → confirm → login → logout flow
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 + 2 → Test auth flows → Deploy/Demo (MVP!)
3. Add User Story 3 → Test password reset → Deploy/Demo
4. Add User Story 4 → Test navigation → Deploy/Demo
5. Add User Story 5 → Test profile display → Deploy/Demo
6. Each story adds value without breaking previous stories

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1. Setup | T001-T007 (7) | Project initialization |
| 2. Foundational | T008-T022 + T017a-d (19) | Database, Supabase utils, services, stores, middleware, design |
| 3. US1 Account Creation | T023-T026 (4) | Signup flow |
| 4. US2 Authentication | T027-T029 (3) | Login/logout flow |
| 5. US3 Password Recovery | T030-T032 (3) | Reset password flow |
| 6. US4 Dashboard Nav | T033-T040 (8) | Layout, sidebar, pages |
| 7. US5 Profile Display | T041-T042 (2) | Avatar, settings profile |
| 8. Polish | T043-T047 (5) | Migration, types, validation |

**Total Tasks**: 51
**MVP Scope**: Phases 1-4 (33 tasks) - Setup, Foundation, Account Creation, Authentication
**Parallel Opportunities**: 18 tasks marked with [P]

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Manual testing per constitution (no automated tests in this phase)
