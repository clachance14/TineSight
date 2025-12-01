<!--
Sync Impact Report
==================
Version change: 0.0.0 → 1.0.0
Modified principles: N/A (initial creation)
Added sections:
  - Core Principles (7 principles)
  - Technology Stack
  - Development Workflow
  - Governance
Removed sections: N/A
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ (no changes needed - generic)
  - .specify/templates/spec-template.md ✅ (no changes needed - generic)
  - .specify/templates/tasks-template.md ✅ (no changes needed - generic)
Follow-up TODOs: None
-->

# TineSight Constitution

## Core Principles

### I. Serverless-First Architecture

All infrastructure MUST use managed, serverless, or platform-as-a-service solutions. Self-managed servers, containers, or VMs are prohibited unless a managed alternative does not exist.

**Rationale:** TineSight is a lean SaaS product. Operational overhead from managing infrastructure detracts from delivering user value. Serverless platforms handle scaling, patching, and availability automatically.

**Requirements:**
- Compute MUST use serverless functions (Vercel API Routes, Trigger.dev jobs)
- Database MUST use managed PostgreSQL (Supabase)
- ML inference MUST use API-based services (Replicate)
- File storage MUST use managed object storage (Supabase Storage)
- New infrastructure additions MUST justify why a managed alternative is insufficient

### II. Human-in-the-Loop AI

AI/ML predictions MUST present suggestions for user verification rather than taking autonomous action on critical data. Users always have final authority over deer identification and catalog decisions.

**Rationale:** Antler re-identification is imperfect (target: 80% top-5 accuracy). Users are domain experts who know their deer. AI augments human judgment; it does not replace it.

**Requirements:**
- Detection results MUST be presented as suggestions with confidence scores
- Deer identity matches MUST require user confirmation before catalog assignment
- Users MUST be able to override, correct, or reject any AI suggestion
- Model training data MUST come from user-confirmed matches only
- Archiving based on "empty" classification MAY be automatic if user-configured threshold is met

### III. Multi-Tenant Data Isolation

All user data MUST be isolated at the database level using Row-Level Security (RLS). Cross-tenant data access MUST be impossible regardless of application bugs.

**Rationale:** TineSight stores sensitive property imagery and deer population data. A security breach affecting one customer's data is unacceptable. RLS provides defense-in-depth beyond application-layer checks.

**Requirements:**
- Every table containing user data MUST have RLS policies enabled
- RLS policies MUST use `auth.uid()` for ownership checks
- Team member access MUST be explicitly granted through `team_members` table
- Service role key usage MUST be limited to background jobs and admin operations
- All storage buckets MUST have folder-based access policies tied to user ID

### IV. Role-Based Access Control

Users are either Owners (full access) or Viewers (limited access). Capabilities MUST be enforced at both UI and API levels.

**Rationale:** TineSight supports collaboration where ranch owners invite helpers to review photos and train the model. Viewers should not be able to modify account settings, upload images, or manage subscriptions.

**Requirements:**
- Owner role: upload, process, manage cameras, invite team, manage billing
- Viewer role: view photos, view catalog, confirm/reject matches, add notes
- API routes MUST verify role before executing privileged operations
- UI MUST hide unavailable actions (not just disable them)
- Role checks MUST occur server-side; client-side checks are for UX only

### V. Integration Testing Over Unit Testing

Testing strategy MUST prioritize integration and contract tests that verify user-facing behavior. Unit tests are optional and should focus on complex business logic.

**Rationale:** TineSight's value comes from integrating multiple services (Supabase, Replicate, Stripe, Trigger.dev). Unit tests of individual functions provide less confidence than tests that verify the full pipeline works.

**Requirements:**
- New features MUST include integration tests covering the primary user journey
- API contract tests MUST exist for all public endpoints
- Database migrations MUST be tested against actual PostgreSQL (not mocks)
- External service calls MAY use recorded responses (VCR pattern) in tests
- Unit tests SHOULD exist for complex algorithms (e.g., embedding similarity)
- Test coverage percentage is NOT a metric; working user flows are the metric

### VI. Phased Delivery with Independent User Stories

Features MUST be decomposed into independently testable and deployable user stories. Each story MUST deliver demonstrable value without requiring other stories to be complete.

**Rationale:** TineSight follows a phased roadmap (MVP → V2 → V3). Within each phase, user stories must be shippable independently to gather feedback early and reduce integration risk.

**Requirements:**
- User stories MUST be prioritized (P1, P2, P3) in specifications
- P1 story MUST deliver a viable MVP on its own
- Stories MUST NOT have circular dependencies
- Each story MUST have defined acceptance criteria and an independent test
- Foundational infrastructure (auth, DB schema) is completed before user stories begin

### VII. Design System Compliance

All UI MUST follow the TineSight Design System (color palette, typography, spacing, components). Dark mode is the default. Deviations require explicit justification.

**Rationale:** Consistent UI builds user trust and reduces cognitive load. Hunters often review images in low-light conditions; dark mode reduces eye strain.

**Requirements:**
- Colors MUST use the defined palette (Slate, Copper, Cream, etc.)
- Typography MUST use Inter (sans) and JetBrains Mono (monospace)
- Spacing MUST use the base-4 scale (4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px)
- Components MUST use shadcn/ui with TineSight theme customizations
- All color combinations MUST meet WCAG 2.1 AA contrast requirements
- Touch targets MUST be at least 44×44px on mobile

## Technology Stack

**Current defaults** (evolution permitted with justification):

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 14 (App Router) | Full-stack React with serverless API |
| Language | TypeScript | Type safety |
| Styling | TailwindCSS + shadcn/ui | Design system implementation |
| Database | PostgreSQL via Supabase | Managed DB with RLS and pgvector |
| Auth | Supabase Auth | Email, OAuth, Magic Link |
| Storage | Supabase Storage | S3-compatible image storage |
| ML Inference | Replicate API | MegaDetector + custom re-ID |
| Background Jobs | Trigger.dev | Async image processing |
| Payments | Stripe | Subscription billing |
| Hosting | Vercel | Frontend + API routes |
| Analytics | PostHog | Product analytics |
| Error Tracking | Sentry | Error monitoring |
| Email | Resend | Transactional emails |

**Stack evolution rules:**
- Replacing a technology MUST maintain principle compliance
- Migration plan MUST exist before starting replacement
- New dependencies MUST not introduce self-managed infrastructure

## Development Workflow

### Branch Strategy
- `main` branch is production-ready
- Feature branches: `###-feature-name`
- All changes require PR review before merge

### Specification Process
1. `/speckit.specify` - Create feature specification with user stories
2. `/speckit.plan` - Generate implementation plan with research
3. `/speckit.tasks` - Generate actionable task list
4. `/speckit.implement` - Execute tasks

### Quality Gates
- All PRs MUST pass CI (lint, type-check, tests)
- Integration tests MUST pass for affected user stories
- RLS policies MUST be verified for new tables
- Design system compliance MUST be verified for UI changes

## Governance

This constitution supersedes all other development practices and guidelines. Amendments require:

1. **Proposal**: Document the change and rationale
2. **Review**: Assess impact on existing code and templates
3. **Migration**: Plan for updating non-compliant code if retroactive
4. **Version bump**: Follow semantic versioning (MAJOR for breaking changes)

### Versioning Policy
- **MAJOR**: Principle removal, redefinition, or backward-incompatible governance change
- **MINOR**: New principle added or existing principle materially expanded
- **PATCH**: Clarifications, wording fixes, non-semantic refinements

### Compliance
- All PRs MUST verify compliance with relevant principles
- Constitution violations MUST be justified in the Complexity Tracking table (plan.md)
- Unjustified violations are grounds for PR rejection

**Version**: 1.0.0 | **Ratified**: 2025-12-01 | **Last Amended**: 2025-12-01
