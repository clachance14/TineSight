# TineSight Product Vision

**Version**: 1.0.0 | **Created**: 2025-12-01 | **Last Updated**: 2025-12-01

## Problem Statement

Hunting lease operators manage 10-20+ game cameras generating thousands of photos per month. They face two sequential problems that prevent them from effectively marketing their properties:

1. **Volume Overwhelm**: 80%+ of photos are empty, blurry, or non-deer. Finding deer photos requires manually scrolling through hundreds of images per camera pull.

2. **Individual Identification**: Once deer are found, reliably answering "Is this the same buck I saw last week?" is impossible without a systematic catalog and trained eye.

**The business impact**: Lease operators cannot efficiently build a portfolio of trophy bucks to attract prospective clients. This directly affects their ability to close lease deals and generate revenue.

## Target User

### Primary: Hunting Lease Operator

| Attribute | Description |
|-----------|-------------|
| **Role** | Runs commercial hunting operation on private land |
| **Scale** | Manages 10-20+ game cameras across property |
| **Goal** | Attract and close hunting lease deals |
| **Pain** | Hours spent sorting photos; can't track individual bucks |
| **Value** | Buck catalog as a sales tool for prospective clients |
| **Team** | May have staff (guides, helpers) who assist with photo review |
| **Willingness to pay** | High - tools that drive revenue are business expenses |

### Secondary Users (Post-MVP)

- **Serious Trophy Hunter**: Individual with 5-20 cameras, tracks specific bucks for seasons
- **Ranch/Property Manager**: Oversees large acreage for wildlife management purposes

## Value Proposition

> TineSight uses AI to automatically filter game camera photos to show only deer, then builds a catalog of individual bucks that can be recognized across your property over time.

**Core differentiator**: AI-powered buck re-identification. Automatic "This is the same buck you saw 3 days ago" matching - something no competitor does well.

## Success Metrics

### Metric Hierarchy

| Level | Metric | Description | Target |
|-------|--------|-------------|--------|
| **Activation** | First upload completed | User engaged with core feature | 80% of signups |
| **First Value** | First deer detected | AI Stage 1 worked | 70% of uploads |
| **Core Value** | First buck re-identified | AI Stage 2 worked (North Star) | TBD - validate |
| **Retention** | Return within 7 days | Product sticky enough | 40%+ |
| **Expansion** | Team member invited | Value worth sharing | 20%+ |

### North Star Metric

**First Buck Re-Identified**: The moment AI correctly matches a buck from a new photo to an existing catalog entry, and the user confirms "Yes, this is the same deer."

This metric captures:
- Core value delivery (the differentiator works)
- User trust established (they confirmed the match)
- Catalog value demonstrated (history accumulating)

## Competitive Landscape

| Competitor | Focus | TineSight Advantage |
|------------|-------|---------------------|
| [DeerLab](https://deerlab.com) | Photo management + manual profiles | No automatic re-identification |
| [Spartan Forge](https://spartanforge.ai) | Movement prediction (where deer go) | Solves different problem (who, not where) |
| [Moultrie Mobile](https://www.moultrie.com/the-app) | Camera ecosystem | Hardware locked; not camera-agnostic |

**Positioning**: TineSight is the only platform focused on **individual deer re-identification** with AI, working with **any camera brand**.

## User Journey

### The Problem Flow (Today)
```
Pull SD cards → Scroll through 500+ photos → Find deer photos manually →
Try to remember "Have I seen this buck?" → Give up or maintain messy folders →
Can't show clients a coherent portfolio
```

### The TineSight Flow

**New User (Cold Start)**:
```
Upload → AI Triage (filters to deer) → TEACH MODEL (user names bucks) →
Build Catalog → Share with clients
```

**Returning User (Model Trained)**:
```
Upload → AI Triage → CONFIRM matches (one-click) → Catalog auto-grows →
Share updated portfolio
```

### Critical Friction: Teaching Fatigue

If initial model training takes too long, users abandon before reaching the "aha" moment.

**Mitigations**:
- Progress indicator: "Model trained on 8 bucks - 70% accuracy"
- Celebrate early: "First re-identification!" notification
- Batch confirm: AI clusters photos, user confirms whole cluster
- Allow skip: "Name later" placeholders
- Early value: Re-ID works with just 2-3 confirmed bucks

## MVP Feature Scope (P1)

### Authentication
- Email/password signup
- Magic link login
- Password reset
- Email verification

### Photo Pipeline
- Bulk photo upload (drag & drop)
- AI auto-detect deer vs empty (Stage 1)

### Deer Catalog
- Individual deer profiles
- Custom naming
- Photo gallery per deer

### AI Re-identification (Differentiator)
- Buck antler fingerprinting (Stage 2)
- "Is this the same buck?" confirmation flow
- Cluster similar photos for batch confirm
- Confidence scoring on matches

## MVP Build Phases

| Phase | Focus | Milestone |
|-------|-------|-----------|
| 0 | Infrastructure | Project setup, DB schema, design system |
| 1 | Auth Complete | User can create and access account |
| 2 | Photo Pipeline | Upload → AI filters to deer photos |
| 3 | Deer Catalog | User can manually build catalog |
| 4 | AI Re-ID | First automatic re-identification |
| 5 | Polish | Optimized new user experience |

## Principles

This product vision is governed by the [TineSight Constitution](./constitution.md), which establishes:

1. **Serverless-First** - Managed services only
2. **Human-in-the-Loop AI** - AI suggests, user confirms
3. **Multi-Tenant Data Isolation** - RLS on every table
4. **Role-Based Access Control** - Owner vs Viewer
5. **Integration Testing** - User flows over unit coverage
6. **Phased Delivery** - Independent, shippable stories
7. **Design System Compliance** - Dark mode, TineSight palette
