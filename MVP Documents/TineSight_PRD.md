TineSight

Product Requirements Document

*AI-Powered Whitetail Deer Identification System*

*for Game Camera Image Management*

Version 1.1

December 2025

1\. Executive Summary

TineSight is a SaaS application designed for ranch owners,
wildlife managers, and hunting enthusiasts who deploy game cameras
across properties. The application addresses the labor-intensive process
of manually reviewing thousands of camera trap images by leveraging
cloud-based computer vision AI to automatically detect deer, identify individual
animals by their unique antler patterns, and intelligently organize
photo libraries.

1.1 Key Value Propositions

1.  **Automatic Empty Image Removal:** Eliminate 60-80% of photos
    containing no animals or objects of interest

2.  **Individual Deer Identification:** Track specific bucks across
    multiple cameras and over time using antler pattern recognition

3.  **Population Insights:** Build a catalog of individual deer on the
    property with sighting history, movement patterns, and growth
    tracking

4.  **Time Savings:** Reduce manual review time from hours to minutes
    per camera pull

2\. Problem Statement

Ranch and property owners deploying game cameras face several
challenges:

-   **Volume Overload:** A single camera can capture 500-2,000+ images
    per week, with 60-80% being empty triggers (wind, shadows, small
    animals)

-   **Manual Review Burden:** Reviewing images from multiple cameras
    across a property can take 4-8+ hours per week

-   **No Individual Tracking:** Unable to reliably identify and track
    specific deer across cameras and seasons

-   **Lost Intelligence:** Valuable data about deer movement patterns,
    population, and individual behavior goes uncaptured

3\. Project Goals

3.1 Primary Goals

1.  Reduce image review time by 80% through automated filtering and
    organization

2.  Enable identification and tracking of individual bucks via antler
    pattern recognition

3.  Provide actionable insights about deer population and movement on
    the property

3.2 Secondary Goals

-   Support multiple camera locations with location-based organization

-   Enable year-over-year tracking of individual deer growth

-   Provide exportable reports for wildlife management purposes

4\. Functional Requirements

4.1 Image Ingestion

1.  Batch import from SD cards, folders, or cloud storage

2.  Support common image formats: JPEG, PNG, HEIC

3.  Extract and preserve EXIF metadata (timestamp, camera ID if
    available)

4.  Associate images with camera locations (user-defined or GPS if
    available)

5.  Handle duplicates intelligently (skip or flag)

4.2 Animal Detection (Stage 1)

1.  Automatically classify images as: Animal, Human, Vehicle, or Empty

2.  Generate bounding boxes around detected animals

3.  Provide confidence scores for detections

4.  Allow user-configurable confidence thresholds

5.  Auto-move empty images to trash/archive folder

4.3 Deer Re-Identification (Stage 2)

1.  Detect and crop antler regions from deer images

2.  Generate feature embeddings for antler patterns

3.  Match against existing deer catalog with similarity scores

4.  Present top-N candidate matches for user verification

5.  Allow users to confirm match, create new deer entry, or mark as
    unknown

6.  Distinguish between bucks (trackable via antlers) and does/fawns
    (general category)

4.4 Deer Catalog & Database

1.  Maintain a catalog of individual identified deer with user-assigned
    names

2.  Store representative images and feature embeddings per deer

3.  Track sighting history: dates, times, locations, images

4.  Support notes and tags per deer (e.g., \"8-pointer\", \"injured
    leg\")

5.  Year-over-year linking for antler growth tracking (manual
    confirmation required)

4.5 User Interface

1.  Dashboard showing recent activity, deer sightings, and processing
    queue

2.  Image gallery with filtering by date, camera, deer, species,
    confidence

3.  Deer profile pages with photo gallery, sighting map, and timeline

4.  Review queue for AI suggestions requiring user confirmation

5.  Camera location management interface

6.  Settings for confidence thresholds, auto-archiving rules, etc.

5\. Technical Architecture & Stack

5.1 Recommended Architecture

TineSight uses a serverless SaaS architecture optimized for rapid deployment and scalability:

  -----------------------------------------------------------------------
  **Component**         **Technology**
  --------------------- -------------------------------------------------
  **Frontend**          Next.js 14 (App Router) with TypeScript, TailwindCSS

  **Backend API**       Next.js API Routes (serverless functions)

  **Database**          PostgreSQL via Supabase + pgvector for embeddings

  **Authentication**    Supabase Auth (Email, OAuth, Magic Link)

  **File Storage**      Supabase Storage (S3-compatible)

  **Animal Detection**  MegaDetector via Replicate API (cloud-hosted)

  **Deer Re-ID**        Custom model via Replicate API

  **Background Jobs**   Trigger.dev (serverless job processing)

  **Payments**          Stripe (subscriptions & billing)

  **Hosting**           Vercel (frontend + API routes)
  -----------------------------------------------------------------------

5.2 Core Dependencies & Services

**Replicate API** (replicate.com)

**Purpose:** Cloud-hosted ML inference for MegaDetector and custom re-ID models.
Eliminates need for local GPU or model management.

**Integration:** REST API calls from Trigger.dev background jobs

**Supabase** (supabase.com)

**Purpose:** Managed PostgreSQL database, authentication, and file storage.
Provides Row Level Security for multi-tenant data isolation.

**Trigger.dev** (trigger.dev)

**Purpose:** Serverless background job processing for image analysis.
Handles batch processing, retries, and job monitoring.

**Stripe** (stripe.com)

**Purpose:** Subscription management and payment processing.
Handles Free, Pro, and Ranch tier billing.

5.3 System Architecture Diagram

The application follows a serverless architecture with managed services:

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

5.4 Subscription Tiers

| Tier | Price | Image Limit | Cameras | Features |
|------|-------|-------------|---------|----------|
| **Free** | $0/mo | 100/month | 1 | Basic detection, manual tagging |
| **Pro** | $9.99/mo | 2,000/month | 5 | Auto re-ID, priority processing |
| **Ranch** | $29.99/mo | 10,000/month | Unlimited | Team members, API access |

5.5 User Roles

TineSight supports collaborative deer tracking with role-based access:

| Role | Capabilities |
|------|--------------|
| **Owner** | Full access: upload images, process photos, manage cameras, invite team members, manage subscription, view analytics |
| **Viewer/Trainer** | Limited access: view photos, confirm/reject deer matches (train model), add notes to deer profiles. Cannot upload, process, or manage account |

**Mobile Experience:** Both roles have access to a mobile-optimized view for reviewing photos and training the model. Photo upload and processing is desktop-only in MVP.

6\. Non-Functional Requirements

6.1 Performance

1.  Process 100 images in under 3 minutes (cloud-based ML inference)

2.  Background processing with progress updates and email notifications

3.  UI response time under 200ms for standard operations

4.  Support image libraries of 100,000+ photos per account

6.2 Accuracy Targets

-   **Empty Image Detection:** \>95% accuracy

-   **Animal vs Non-Animal:** \>90% precision at 95% recall

-   **Deer Re-ID (Same Season):** \>80% top-5 accuracy for confirmed
    matches

6.3 Deployment

TineSight is deployed as a fully managed SaaS application:

-   **Frontend & API:** Vercel (auto-scaling, global CDN)

-   **Database & Storage:** Supabase (managed PostgreSQL, S3-compatible storage)

-   **ML Inference:** Replicate (pay-per-inference, no GPU management)

-   **Background Jobs:** Trigger.dev (serverless job processing)

7\. Development Roadmap

7.1 MVP (Phase 1)

Full SaaS foundation with core deer tracking functionality:

**Authentication & Payments**
1.  User registration with email/OAuth (Supabase Auth)
2.  Subscription tiers with Stripe integration
3.  Usage metering and limits enforcement

**Core Features**
4.  Image import and organization by camera location
5.  MegaDetector integration via Replicate API
6.  Automatic empty image archiving
7.  Photo gallery with filtering (date, camera, classification)
8.  Manual deer tagging and naming
9.  Deer catalog with basic profiles

**Infrastructure**
10. Background job processing (Trigger.dev)
11. Transactional emails (Resend)
12. Analytics (PostHog) and error tracking (Sentry)

7.2 Version 2.0 (Phase 2)

Advanced deer re-identification and collaboration:

1.  Antler detection and cropping
2.  Re-identification model via Replicate
3.  Automated deer matching suggestions
4.  Review queue for AI suggestions
5.  Team member invitations (Viewer/Trainer role)
6.  Mobile-responsive view & train interface

7.3 Future Enhancements (Phase 3+)

1.  Native mobile app
2.  Movement pattern visualization and heatmaps
3.  Multi-property support
4.  Integration with cellular game cameras for real-time processing
5.  Antler scoring estimation
6.  Export to wildlife management systems
7.  API access for Ranch tier customers

8\. Risks and Mitigations

| **Risk** | **Impact** | **Mitigation** |
|----------|------------|----------------|
| Antler re-ID accuracy insufficient | High - core value proposition | Human-in-the-loop verification; fall back to manual tagging; collect training data from user confirmations |
| Year-over-year matching fails (antler changes) | Medium - affects long-term tracking | Manual linking for year-over-year; explore body pattern recognition as supplement |
| Replicate API costs exceed projections | Medium - affects margins | Monitor per-user costs; adjust pricing tiers; consider hybrid model with batch processing |
| Limited training data for whitetail antlers | High - affects model quality | Collect data from early users with consent; partner with wildlife researchers |
| User churn due to seasonal usage | Medium - affects revenue | Annual subscription discount; off-season features (deer profile management, reports) |

9\. Success Metrics

**Product Metrics**
1.  **Time Savings:** 80% reduction in manual image review time vs. baseline
2.  **Detection Accuracy:** 95%+ accuracy on empty image classification
3.  **Re-ID Utility:** Users confirm \>70% of suggested deer matches
4.  **Adoption:** Users process \>80% of imported images through the system
5.  **Catalog Growth:** Average user builds catalog of 10+ identified deer within first season

**Business Metrics**
6.  **Conversion:** \>5% free-to-paid conversion rate
7.  **Retention:** \>60% annual renewal rate
8.  **NPS:** Net Promoter Score \>40
9.  **CAC Payback:** \<6 months for Pro tier

10\. Appendix: Key Resources

**Core Services**

-   **Supabase:** supabase.com - Database, Auth, Storage
-   **Vercel:** vercel.com - Hosting
-   **Replicate:** replicate.com - ML inference API
-   **Trigger.dev:** trigger.dev - Background jobs
-   **Stripe:** stripe.com - Payments

**ML Models & Research**

-   **MegaDetector:** github.com/agentmorris/MegaDetector
-   **PyTorch-Wildlife:** github.com/microsoft/CameraTraps
-   **Wildbook/WBIA:** github.com/WildMeOrg/wildbook-ia (re-ID reference)
-   **Camera Trap ML Survey:** agentmorris.github.io/camera-trap-ml-survey

**Research References**

-   Sika Deer Facial Recognition (ViT-based) - ScienceDirect, Oct 2023
-   HotSpotter Algorithm - Crall et al., IEEE WACV 2013
-   DeerSpotter (Wild Me) - wildme.org/deerspotter

---

*Document aligned with Project_Setup.md and Design_System.md - December 2025*