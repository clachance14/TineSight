TineSight Design System
UI/UX Design Document
Version 1.0 | December 2025

Table of Contents

Brand Identity
Color System
Typography
Spacing & Layout
Components
Screen Layouts
Icons & Imagery
Interaction Patterns
Accessibility


1. Brand Identity
1.1 Brand Essence
TineSight is built for serious deer hunters and wildlife managers who want professional-grade tools without complexity. The brand balances rugged outdoor authenticity with modern AI technology.
Brand Attributes:

Precise — AI-powered accuracy in identification
Rugged — Built for the field, not the office
Efficient — Saves hours of manual work
Trustworthy — Reliable results hunters can count on

Voice & Tone:

Direct and practical, not salesy
Technical when needed, but never jargon-heavy
Confident without being boastful
Respects the user's expertise

1.2 User Roles & Experience

TineSight supports two user roles with distinct UI experiences:

**Owner (Full Access)**
- Full navigation: Dashboard, Photos, Deer, Cameras, Settings, Billing
- Can upload images, process photos, manage cameras
- Can invite and manage team members
- Desktop-optimized for heavy workflows

**Viewer/Trainer (Limited Access)**
- Limited navigation: Photos, Deer, Review Queue only
- Can view photos and deer catalog
- Can confirm/reject deer matches (training the model)
- Can add notes to deer profiles
- Mobile-optimized for field use

**Visual Differentiation:**
- Viewer role sees simplified sidebar with fewer options
- Upload/Process buttons are hidden for Viewers
- Settings and Billing are hidden for Viewers
- "View Only" badge shown in header for Viewers

1.3 Logo
The TineSight logo combines a stylized game camera body with whitetail deer antlers. The camera aperture in the center represents the AI "vision" that powers the application.
Logo Versions:
VersionUse CaseFull ColorPrimary usage on dark backgroundsMonochrome LightLight backgrounds, printMonochrome DarkDark backgrounds when color unavailableIcon OnlyApp icon, favicon, small spaces
Clear Space:
Maintain clear space equal to the height of the camera body on all sides of the logo.
Minimum Size:

Full logo: 120px wide minimum
Icon only: 32px minimum

Don'ts:

Don't rotate or skew the logo
Don't change the colors outside brand palette
Don't add effects (shadows, glows, outlines)
Don't place on busy photographic backgrounds without overlay


2. Color System
2.1 Primary Palette
Derived from the brand logo, these colors form the core visual identity.
NameHexRGBUsageSlate#3D4A4D61, 74, 77Primary background, headersCopper#C4895A196, 137, 90Primary accent, CTAs, highlightsCream#F5F0E8245, 240, 232Light backgrounds, cardsCharcoal#5A5D5E90, 93, 94Secondary elements, iconsWarm Gray#8A8B87138, 139, 135Tertiary, disabled states
2.2 Extended UI Palette
Additional colors for interface elements and states.
Backgrounds:
NameHexUsageDeep Slate#2D3638Darkest background, modals overlaySlate#3D4A4DPrimary dark backgroundSlate Light#4D5A5DElevated surfaces (cards on dark)Cream#F5F0E8Light mode backgroundCream Dark#E8E3DBLight mode cards/sectionsWhite#FFFFFFLight mode elevated surfaces
Text Colors:
NameHexUsageText Primary (Dark Mode)#F5F0E8Headings, body on darkText Secondary (Dark Mode)#A8A9A5Captions, metadata on darkText Primary (Light Mode)#2D3638Headings, body on lightText Secondary (Light Mode)#5A5D5ECaptions, metadata on light
Semantic Colors:
NameHexUsageSuccess#4A7C59Confirmed matches, success statesWarning#D4A34APending review, cautionError#C45A5AErrors, delete actionsInfo#5A8AC4Informational, help tips
Deer Classification Colors:
NameHexUsageBuck Identified#C4895ACopper — confirmed buck IDBuck Unknown#D4A34AAmber — unmatched buckDoe/Fawn#7A9A8ASage — does and fawnsOther Animal#8A8B87Gray — non-deer animalsEmpty#5A5D5ECharcoal — no detection
2.3 Color Application
Dark Mode (Default):
The application defaults to dark mode, reflecting the low-light conditions hunters often work in and reducing eye strain during long review sessions.
┌─────────────────────────────────────────┐
│ Header Bar               [Slate #3D4A4D]│
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────┐  ┌─────────┐              │
│  │  Card   │  │  Card   │  [Slate Light]│
│  └─────────┘  └─────────┘              │
│                          [Deep Slate bg]│
│  [Copper] Primary Button                │
│                                         │
└─────────────────────────────────────────┘
Light Mode (Optional):
Available for outdoor/daylight use where screen visibility is important.

3. Typography
3.1 Font Stack
Primary Font: Inter
A highly legible sans-serif optimized for screens. Available via Google Fonts.
cssfont-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
Monospace Font: JetBrains Mono
For technical data, timestamps, and confidence scores.
cssfont-family: 'JetBrains Mono', 'Fira Code', monospace;
3.2 Type Scale
NameSizeWeightLine HeightUsageDisplay36px / 2.25rem7001.2Page titles, hero textH128px / 1.75rem6001.3Section headersH222px / 1.375rem6001.35Card titles, subsectionsH318px / 1.125rem6001.4Component headersBody Large16px / 1rem4001.5Primary body textBody14px / 0.875rem4001.5Secondary body, descriptionsCaption12px / 0.75rem4001.4Metadata, timestampsOverline11px / 0.6875rem6001.3Labels, categories (uppercase)
3.3 Typography Examples
Deer Profile Header:
[Display] Big 8                          ← Deer name
[Caption] First seen: Oct 15, 2025       ← Metadata
[Body] 8-point typical • North Feeder    ← Tags/location
Image Card:
[H3] Camera: Oak Stand
[Caption, Mono] 2025-11-28 06:42:31
[Caption] Confidence: 94%

4. Spacing & Layout
4.1 Spacing Scale
Use a base-4 spacing system for consistency.
TokenValueUsagespace-14pxTight gaps, icon paddingspace-28pxRelated element spacingspace-312pxDefault component paddingspace-416pxCard padding, section gapsspace-524pxMajor section spacingspace-632pxPage section breaksspace-848pxMajor layout divisionsspace-1064pxPage margins (desktop)
4.2 Grid System
Desktop (1280px+):

12-column grid
24px gutters
64px side margins
Max content width: 1440px

Tablet (768px - 1279px):

8-column grid
16px gutters
32px side margins

Mobile (< 768px):

4-column grid
16px gutters
16px side margins

4.3 Layout Patterns
Primary App Layout:
┌────────────────────────────────────────────────────┐
│ Top Bar (56px)                          [User] [⚙]│
├──────────┬─────────────────────────────────────────┤
│          │                                         │
│  Side    │  Main Content Area                      │
│  Nav     │                                         │
│  (240px) │  ┌─────────────────────────────────┐   │
│          │  │ Page Header                     │   │
│  • Dash  │  ├─────────────────────────────────┤   │
│  • Photos│  │                                 │   │
│  • Deer  │  │ Content                         │   │
│  • Cams  │  │                                 │   │
│  • Queue │  │                                 │   │
│          │  └─────────────────────────────────┘   │
│          │                                         │
└──────────┴─────────────────────────────────────────┘
Collapsible Sidebar:
On tablet and when user preference, sidebar collapses to 64px icon-only rail.

5. Components
5.1 Buttons
Primary Button (Copper)
┌──────────────────────────┐
│      Process Images      │  Background: #C4895A
└──────────────────────────┘  Text: #2D3638 (dark)
                              Padding: 12px 24px
                              Border-radius: 6px
                              Font: Body Large, 600 weight
States:
StateBackgroundTextDefault#C4895A#2D3638Hover#D49A6A#2D3638Active#B47A4A#2D3638Disabled#8A8B87#5A5D5E
Secondary Button (Outline)
┌──────────────────────────┐
│        Cancel            │  Background: transparent
└──────────────────────────┘  Border: 1px solid #C4895A
                              Text: #C4895A
Ghost Button
No border, just text with hover state. Used for tertiary actions.
Icon Button
┌─────┐
│  ⋮  │  40px × 40px
└─────┘  Border-radius: 8px
         Icon: 20px
5.2 Cards
Image Card:
┌─────────────────────────────┐
│                             │
│      [Image Thumbnail]      │  Aspect: 4:3
│           280×210           │
│                             │
├─────────────────────────────┤
│ 📍 Oak Stand                │  Location
│ Nov 28, 2025 • 6:42 AM      │  Timestamp
│ ┌────────┐                  │
│ │ Animal │ 94%              │  Classification badge
│ └────────┘                  │
└─────────────────────────────┘

Background: Slate Light (#4D5A5D)
Border-radius: 8px
Padding: 0 (image) / 12px (content)
Deer Profile Card:
┌─────────────────────────────┐
│ ┌─────┐                     │
│ │     │  Big 8              │  Representative image
│ │ IMG │  8-point typical    │  80×80, rounded
│ └─────┘                     │
│                             │
│ Last seen: 2 days ago       │
│ Sightings: 24               │
│ ████████░░ 80%              │  Confidence bar
└─────────────────────────────┘
5.3 Badges & Tags
Classification Badge:
┌──────────┐
│ 🦌 Buck  │  Padding: 4px 8px
└──────────┘  Border-radius: 4px
              Font: Caption, 600
TypeBackgroundTextBuck (ID'd)#C4895A#2D3638Buck (Unknown)#D4A34A#2D3638Doe/Fawn#7A9A8A#2D3638Other Animal#5A5D5E#F5F0E8Empty#3D4A4D#8A8B87Human#5A8AC4#F5F0E8Vehicle#8A8B87#2D3638
Status Badge:
StatusStyleProcessingPulsing amber dot + "Processing"Pending ReviewSolid amber dotConfirmedGreen checkmarkArchivedGray, strikethrough
5.4 Form Inputs
Text Input:
┌─────────────────────────────┐
│ Camera Name                 │  Label: Caption, above
├─────────────────────────────┤
│ North Food Plot             │  Input: Body, inside
└─────────────────────────────┘
Background: #2D3638
Border: 1px solid #5A5D5E
Focus border: #C4895A
Border-radius: 6px
Padding: 12px
Select/Dropdown:
Same styling as text input with chevron indicator.
Slider (Confidence Threshold):
      50%
├──────●──────────┤
0%              100%

Track: #5A5D5E (4px height)
Filled: #C4895A
Thumb: #F5F0E8 (16px circle)
Checkbox:
[✓] Include empty images

Unchecked: #5A5D5E border, transparent fill
Checked: #C4895A fill, #2D3638 check
Size: 18px
Border-radius: 4px
5.5 Navigation
Sidebar Navigation Item:
┌─────────────────────────┐
│ 📷  Photo Gallery       │
└─────────────────────────┘
Default: Transparent background
Hover: #4D5A5D background
Active: #C4895A left border (3px), #4D5A5D background
Icon: 20px, Warm Gray
Active Icon: Copper
Text: Body, 500 weight
Padding: 12px 16px
Top Bar:
┌──────────────────────────────────────────────────────┐
│ [≡] TineSight              [🔍] [🔔 2] [👤 John] [⚙] │
└──────────────────────────────────────────────────────┘
Height: 56px
Background: #3D4A4D
Border-bottom: 1px solid #4D5A5D
5.6 Modals & Dialogs
Standard Modal:
        ┌─────────────────────────────────┐
        │ Confirm Match                 ✕ │
        ├─────────────────────────────────┤
        │                                 │
        │  Is this Big 8?                 │
        │                                 │
        │  ┌─────────┐    ┌─────────┐    │
        │  │ Current │    │  Big 8  │    │
        │  │  Image  │ → │ Reference│    │
        │  └─────────┘    └─────────┘    │
        │                                 │
        │  Similarity: 87%                │
        │                                 │
        ├─────────────────────────────────┤
        │      [Cancel]  [Confirm Match]  │
        └─────────────────────────────────┘

Overlay: #2D3638 at 80% opacity
Modal background: #3D4A4D
Border-radius: 12px
Max-width: 560px
5.7 Data Visualization
Sighting Timeline:
Nov 2025
  ●───●─────●●──────●───────●●●   Oak Stand (12)
  ──────●──────────●────────●──     Creek Crossing (4)
  ●────────────────●──────────    North Feeder (2)
  
● = sighting    Line connects same camera
Color: Copper for selected deer, Warm Gray for others
Confidence Meter:
┌────────────────────────────────┐
│ Match Confidence               │
│ ████████████████░░░░ 78%       │
└────────────────────────────────┘
<50%: Error red
50-70%: Warning amber
70-85%: Copper
>85%: Success green

6. Screen Layouts
6.1 Dashboard
The dashboard provides at-a-glance status of recent activity and processing queue.
┌────────────────────────────────────────────────────────────┐
│ Dashboard                                                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ 1,247        │ │ 847          │ │ 23           │       │
│  │ Total Images │ │ Animals      │ │ Bucks ID'd   │       │
│  │ this week    │ │ detected     │ │ this week    │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                            │
│  ┌────────────────────────────┐ ┌────────────────────────┐│
│  │ Processing Queue           │ │ Recent Deer Sightings  ││
│  │                            │ │                        ││
│  │ ████████░░░░░ 156/400      │ │ • Big 8 - 2 hrs ago   ││
│  │ Estimated: 12 min          │ │ • Tall Tines - 5 hrs  ││
│  │                            │ │ • Unknown Buck #47    ││
│  │ [View Queue]               │ │ • Kicker - Yesterday  ││
│  └────────────────────────────┘ │                        ││
│                                 │ [View All Deer →]      ││
│  ┌────────────────────────────┐ └────────────────────────┘│
│  │ Pending Review (12)        │                          │
│  │ ┌────┐ ┌────┐ ┌────┐ ┌────┐│                          │
│  │ │    │ │    │ │    │ │ +8 ││                          │
│  │ └────┘ └────┘ └────┘ └────┘│                          │
│  │ [Review Now]               │                          │
│  └────────────────────────────┘                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
6.2 Photo Gallery
Grid view of all images with filtering and bulk actions.
┌────────────────────────────────────────────────────────────┐
│ Photo Gallery                                              │
├────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ ┌──────────────┐ │
│ │ 🔍 Search photos...                  │ │ Filters (3)▼ │ │
│ └──────────────────────────────────────┘ └──────────────┘ │
│                                                            │
│ Showing 847 of 1,247 images           [Grid ▣] [List ☰]   │
│                                                            │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│ │ ☑       │ │         │ │         │ │         │          │
│ │         │ │         │ │         │ │         │          │
│ │  [IMG]  │ │  [IMG]  │ │  [IMG]  │  │  [IMG]  │          │
│ │         │ │         │ │         │ │         │          │
│ ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤          │
│ │Oak Stand│ │N Feeder │ │Oak Stand│ │Creek    │          │
│ │6:42 AM  │ │7:15 AM  │ │8:30 AM  │ │9:02 AM  │          │
│ │[🦌 Buck]│ │[🦌 Doe] │ │[Empty]  │ │[🦌 Buck]│          │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                            │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│ │         │ │         │ │         │ │         │          │
│ │  . . .  │ │  . . .  │ │  . . .  │ │  . . .  │          │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                            │
│ ──────────────────────────────────────────                │
│ 3 selected                    [Archive] [Tag Deer] [Delete]│
└────────────────────────────────────────────────────────────┘
Filter Panel (Expanded):
┌────────────────────────────┐
│ Filters                  ✕ │
├────────────────────────────┤
│ Date Range                 │
│ [Nov 1, 2025] → [Nov 28]   │
│                            │
│ Camera                     │
│ [All Cameras         ▼]    │
│                            │
│ Classification             │
│ [✓] Bucks    [✓] Does      │
│ [✓] Other    [ ] Empty     │
│ [ ] Human    [ ] Vehicle   │
│                            │
│ Deer                       │
│ [Select specific deer ▼]   │
│                            │
│ Confidence                 │
│ ├────────●────────┤        │
│ Min: 70%                   │
│                            │
│ [Reset] [Apply Filters]    │
└────────────────────────────┘
6.3 Deer Catalog
List of all identified deer with search and sorting.
┌────────────────────────────────────────────────────────────┐
│ Deer Catalog                              [+ Add New Deer] │
├────────────────────────────────────────────────────────────┤
│ ┌────────────────────────┐  Sort: [Last Seen ▼]           │
│ │ 🔍 Search deer...      │  23 bucks • 4 unknown          │
│ └────────────────────────┘                                 │
│                                                            │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ ┌─────┐                                              │  │
│ │ │     │  Big 8                              ●──────● │  │
│ │ │ IMG │  8-point typical • North Feeder     Nov '25  │  │
│ │ └─────┘  Last seen: 2 days ago • 24 sightings    [→] │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ ┌─────┐                                              │  │
│ │ │     │  Tall Tines                         ●──●──●  │  │
│ │ │ IMG │  10-point • Oak Stand, Creek        Nov '25  │  │
│ │ └─────┘  Last seen: 5 hours ago • 18 sightings   [→] │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ ┌─────┐                                              │  │
│ │ │  ?  │  Unknown Buck #47                       ●    │  │
│ │ │     │  Pending identification               Nov 28 │  │
│ │ └─────┘  1 sighting • [Identify] [Merge]         [→] │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
6.4 Deer Profile
Detailed view of an individual deer with all sightings and data.
┌────────────────────────────────────────────────────────────┐
│ ← Back to Catalog                                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌────────────────┐   Big 8                                │
│  │                │   ─────────────────────────────        │
│  │                │   8-point typical                      │
│  │  [Hero Image]  │                                        │
│  │                │   📅 First seen: Oct 15, 2025          │
│  │    400×300     │   👁 Last seen: Nov 26, 2025           │
│  │                │   📸 Total sightings: 24               │
│  └────────────────┘   📍 Primary location: Oak Stand       │
│                                                            │
│  Tags: [8-point] [mature] [shooter] [+ Add]                │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Notes                                          [Edit]│  │
│  │ Distinctive kicker on left G2. First appeared       │  │
│  │ mid-October, seems to be bedding in the cedar       │  │
│  │ thicket north of the feeder.                        │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ [Photos (24)] [Timeline] [Movement Map]                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Nov 26        Nov 22        Nov 20        Nov 18          │
│  ┌─────┐       ┌─────┐       ┌─────┐       ┌─────┐        │
│  │     │       │     │       │     │       │     │        │
│  │     │       │     │       │     │       │     │        │
│  └─────┘       └─────┘       └─────┘       └─────┘        │
│  Oak Stand     Creek         Oak Stand     N Feeder        │
│  6:42 AM       5:15 PM       7:30 AM       6:15 AM         │
│                                                            │
│                    [Load More Photos]                      │
│                                                            │
└────────────────────────────────────────────────────────────┘
6.5 Review Queue
Interface for confirming or rejecting AI match suggestions.
┌────────────────────────────────────────────────────────────┐
│ Review Queue                                 12 pending    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Reviewing 1 of 12                      [Skip] [Exit]      │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                                                     │  │
│  │                   [Current Image]                   │  │
│  │                                                     │  │
│  │                      640×480                        │  │
│  │                                                     │  │
│  │  ┌───────────────┐                                  │  │
│  │  │ Antler Region │ ← AI detected region             │  │
│  │  └───────────────┘                                  │  │
│  │                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  📍 Oak Stand • Nov 28, 2025 6:42 AM                       │
│                                                            │
│  ─────────────────────────────────────────────────────     │
│  AI Suggestion: This looks like Big 8 (87% confidence)     │
│  ─────────────────────────────────────────────────────     │
│                                                            │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                │
│  │           │ │           │ │           │                │
│  │  Big 8    │ │  Kicker   │ │Tall Tines │                │
│  │  [87%]    │ │  [62%]    │ │  [45%]    │                │
│  │           │ │           │ │           │                │
│  └───────────┘ └───────────┘ └───────────┘                │
│  [✓ Confirm]   [Select]      [Select]       [New Deer]    │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Or: [Not a Buck] [Poor Quality] [Mark as Unknown]   │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓●▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓              │
│  Progress: 1/12                                            │
│                                                            │
└────────────────────────────────────────────────────────────┘
6.6 Camera Management
Configure and organize camera locations.
┌────────────────────────────────────────────────────────────┐
│ Camera Locations                           [+ Add Camera]  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │                                                    │   │
│  │                   [Property Map]                   │   │
│  │                                                    │   │
│  │        📍 Oak Stand                                │   │
│  │                    📍 Creek Crossing               │   │
│  │    📍 North Feeder                                 │   │
│  │                        📍 South Blind              │   │
│  │                                                    │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 📍 Oak Stand                                   [Edit]│ │
│  │    856 images • Last upload: Nov 28            [···] │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 📍 North Feeder                                [Edit]│ │
│  │    412 images • Last upload: Nov 27            [···] │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 📍 Creek Crossing                              [Edit]│ │
│  │    203 images • Last upload: Nov 28            [···] │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
6.7 Mobile Experience (Viewer Role)

The mobile interface is optimized for Viewers reviewing photos and training the model in the field.

**Mobile Navigation (Bottom Tab Bar)**
```
┌────────────────────────────────────────────────────────────┐
│ [Status Bar]                                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │         │ │         │ │         │ │         │          │
│  │  [IMG]  │ │  [IMG]  │ │  [IMG]  │ │  [IMG]  │          │
│  │         │ │         │ │         │ │         │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │         │ │         │ │         │ │         │          │
│  │  [IMG]  │ │  [IMG]  │ │  [IMG]  │ │  [IMG]  │          │
│  │         │ │         │ │         │ │         │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                            │
├────────────────────────────────────────────────────────────┤
│    📷        🦌         ✓          👤                      │
│  Photos     Deer     Review     Profile                    │
└────────────────────────────────────────────────────────────┘

Tab Bar: 56px height
Background: Slate (#3D4A4D)
Active: Copper icon + label
Inactive: Warm Gray icon
```

**Mobile Review Queue (Swipe Interface)**
```
┌────────────────────────────────────────────────────────────┐
│ Review Queue                              3/12             │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                                                      │ │
│  │                   [Current Image]                    │ │
│  │                      Full Width                      │ │
│  │                                                      │ │
│  │                   ← SWIPE →                          │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  📍 Oak Stand • 6:42 AM                                    │
│                                                            │
│  AI Suggestion: Big 8 (87%)                                │
│                                                            │
│  ┌────────┐ ┌────────┐ ┌────────┐                        │
│  │ Big 8  │ │ Kicker │ │  New   │                        │
│  │  87%   │ │  62%   │ │  Deer  │                        │
│  └────────┘ └────────┘ └────────┘                        │
│                                                            │
│  ═══════════════════●══════════                            │
│                                                            │
└────────────────────────────────────────────────────────────┘

Gestures:
- Swipe left: Reject / Skip
- Swipe right: Confirm match
- Tap candidate: Select different match
- Tap "New Deer": Create new entry
```

6.8 Invite Team Member Flow

**Invite Modal (Owner Only)**
```
        ┌─────────────────────────────────────┐
        │ Invite Team Member               ✕ │
        ├─────────────────────────────────────┤
        │                                     │
        │  Email Address                      │
        │  ┌─────────────────────────────┐   │
        │  │ hunter@example.com          │   │
        │  └─────────────────────────────┘   │
        │                                     │
        │  Role                               │
        │  ○ Viewer                           │
        │    Can view photos and help         │
        │    train deer identification        │
        │                                     │
        │  ℹ Viewers cannot upload photos     │
        │    or manage your account           │
        │                                     │
        ├─────────────────────────────────────┤
        │       [Cancel]  [Send Invite]       │
        └─────────────────────────────────────┘

Note: Only "Viewer" role available in MVP.
"Admin" role planned for future.
```

**Team Management Screen (Owner Only)**
```
┌────────────────────────────────────────────────────────────┐
│ Team Members                               [+ Invite]      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 👤 You (Owner)                                       │ │
│  │    john@example.com                           Owner  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 👤 Sarah Smith                              [Remove] │ │
│  │    sarah@example.com                        Viewer  │ │
│  │    Joined Nov 15, 2025                              │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 👤 Mike Johnson                             [Remove] │ │
│  │    mike@example.com                 Pending Invite  │ │
│  │    Invited Nov 20, 2025           [Resend] [Cancel] │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ──────────────────────────────────────────────────────── │
│  Ranch plan: Unlimited team members                        │
│  Pro plan: Upgrade for team features                       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

6.9 Import Flow
Multi-step wizard for importing images.
Step 1: Select Source
┌────────────────────────────────────────────────────────────┐
│ Import Images                                              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ○ ─ ─ ─ ─ ○ ─ ─ ─ ─ ○ ─ ─ ─ ─ ○                          │
│  Source    Camera    Options    Import                     │
│                                                            │
│  Select image source:                                      │
│                                                            │
│  ┌────────────────┐  ┌────────────────┐                   │
│  │                │  │                │                   │
│  │   📁 Folder    │  │   💾 SD Card   │                   │
│  │                │  │                │                   │
│  │  Select from   │  │  Auto-detect   │                   │
│  │  computer      │  │  SD cards      │                   │
│  └────────────────┘  └────────────────┘                   │
│                                                            │
│  ┌────────────────┐  ┌────────────────┐                   │
│  │                │  │                │                   │
│  │   ☁ Cloud      │  │   🔗 Previous  │                   │
│  │                │  │                │                   │
│  │  S3, Google    │  │  Re-import     │                   │
│  │  Drive, etc.   │  │  location      │                   │
│  └────────────────┘  └────────────────┘                   │
│                                                            │
└────────────────────────────────────────────────────────────┘
Step 3: Processing
┌────────────────────────────────────────────────────────────┐
│ Processing 847 images...                                   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│         ┌─────────────────────────────────┐               │
│         │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │               │
│         │ ████████████████░░░░░░░░░░░░░░ │  56%          │
│         │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │               │
│         └─────────────────────────────────┘               │
│                                                            │
│         474 / 847 images processed                         │
│         Estimated time remaining: 4 min                    │
│                                                            │
│         ─────────────────────────────────                  │
│         Results so far:                                    │
│         🦌 312 animals detected                            │
│         👤 8 humans                                        │
│         🚗 3 vehicles                                      │
│         ⬜ 151 empty                                       │
│                                                            │
│                   [Cancel Import]                          │
│                                                            │
└────────────────────────────────────────────────────────────┘

7. Icons & Imagery
7.1 Icon Style
Use Lucide Icons (lucide.dev) as the primary icon set. They're clean, consistent, and work well at small sizes.
Icon Sizing:
ContextSizeNavigation20pxInline with text16pxCard actions18pxLarge feature icons24pxHero/empty state48px
Icon Colors:

Default: Warm Gray (#8A8B87)
Active/Hover: Copper (#C4895A)
Disabled: #5A5D5E
On copper background: Dark Slate (#2D3638)

7.2 Custom Icons Needed
The following custom icons should be created to match Lucide style:
IconDescriptionAntlerStylized deer antler for deer-related actionsBuckMale deer silhouetteDoeFemale deer silhouetteGame CameraTrail camera iconEmpty ImageCrossed-out image iconTine CountAntler with point indicators
7.3 Image Handling
Thumbnails:

Aspect ratio: 4:3 (matching most game cameras)
Sizes: 160px, 280px, 400px widths
Format: WebP with JPEG fallback
Loading: Lazy load with blur placeholder

Deer Representative Images:

Aspect ratio: 1:1 (square crop focused on deer)
Sizes: 80px (list), 160px (card), 400px (profile)
Auto-cropped to detected deer bounding box

Image Overlay States:
┌─────────────────┐
│ ☑              │  ← Selection checkbox (top-left)
│                 │
│    [Image]      │
│                 │
│           🦌 94%│  ← Classification badge (bottom-right)
└─────────────────┘

On hover:
┌─────────────────┐
│ ░░░░░░░░░░░░░░░░│  ← Semi-transparent overlay
│    [Expand]     │  ← Quick action buttons
│    [Tag Deer]   │
│    [Archive]    │
└─────────────────┘
7.4 Empty States
When a view has no content, display helpful empty states:
┌─────────────────────────────────────┐
│                                     │
│              📷                     │  48px icon, Warm Gray
│                                     │
│       No photos imported yet        │  H2, Text Primary
│                                     │
│   Import images from your game      │  Body, Text Secondary
│   cameras to get started.           │
│                                     │
│       [Import Images]               │  Primary button
│                                     │
└─────────────────────────────────────┘

8. Interaction Patterns
8.1 Loading States
Skeleton Screens:
Use skeleton placeholders that match the shape of content being loaded.
┌─────────────────┐
│ ░░░░░░░░░░░░░░░ │  ← Animated pulse effect
│ ░░░░░░░░░░░░░░░ │     Background: #4D5A5D
│ ░░░░░░░░░░░░░░░ │     Highlight: #5A6A6D
├─────────────────┤
│ ░░░░░░░░░░      │
│ ░░░░░░          │
└─────────────────┘
Progress Indicators:

Determinate: Use progress bar with percentage for batch operations
Indeterminate: Use spinner for single-item operations
Background: Show processing queue status in header badge

8.2 Drag & Drop
Image Import:
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
                                     
│     Drop images here to import     │   Border: 2px dashed #C4895A
                                         Background: #C4895A at 10%
│           📁 847 files             │
                                     
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
Photo Organization:

Drag photos to assign to camera locations
Drag deer cards to merge identities
Visual feedback: Ghost image follows cursor, drop targets highlight

8.3 Keyboard Shortcuts
ActionShortcutSearch/ or Cmd+KImport imagesCmd+INext image→ or JPrevious image← or KConfirm matchEnter or YSkip/RejectEsc or NNew deerShift+NToggle sidebar[Gallery viewGDeer catalogD
Display keyboard hints on hover for discoverable actions.
8.4 Touch Interactions
Mobile Gestures:

Swipe left/right: Navigate images in review queue
Swipe down: Dismiss image detail view
Pinch: Zoom on images
Long press: Select multiple items
Double tap: Quick zoom to detected deer region

8.5 Confirmations
Destructive Actions:
Require confirmation for:

Deleting images (not archiving)
Removing deer from catalog
Merging deer identities (irreversible)

┌─────────────────────────────────────┐
│ ⚠ Delete 24 images?                │
├─────────────────────────────────────┤
│                                     │
│ This will permanently delete these  │
│ images. This cannot be undone.      │
│                                     │
│ Tip: Use Archive to hide images     │
│ without deleting them.              │
│                                     │
├─────────────────────────────────────┤
│   [Cancel]           [Delete]       │  Delete button: Error red
└─────────────────────────────────────┘
Undo Support:
For non-destructive actions, use toast notifications with undo:
┌──────────────────────────────────────────────┐
│ ✓ 5 images archived              [Undo]      │
└──────────────────────────────────────────────┘
8.6 Notifications & Toasts
Toast Notifications:

Position: Bottom-center
Auto-dismiss: 4 seconds (with progress bar)
Persist on hover
Stack limit: 3 visible, queue additional

Notification Types:
TypeIconColorSuccess✓Success greenError✕Error redWarning⚠Warning amberInfoℹInfo blueProcessingSpinnerCopper

9. Accessibility
9.1 Color & Contrast
All color combinations meet WCAG 2.1 AA standards:
ForegroundBackgroundRatioPassCream textSlate bg7.2:1AAACopperSlate bg4.6:1AACream textCopper bg4.8:1AACharcoalCream bg7.4:1AAA
Never rely on color alone:

Pair classification colors with icons and text labels
Use patterns or shapes for charts, not just color
Error states include both red color AND icon + text

9.2 Focus States
All interactive elements must have visible focus states:
Button (focused):
┌──────────────────────────┐
│      Process Images      │  + 2px Copper outline
└──────────────────────────┘    + 2px offset

Card (focused):
┌─────────────────────────────┐
│ ┃                          │  Left border: 3px Copper
│ ┃     [Image + Content]    │
│ ┃                          │
└─────────────────────────────┘
9.3 Screen Reader Support
Landmarks:

<header> for top bar
<nav> for sidebar navigation
<main> for primary content
<aside> for filter panels

Image Alt Text:
html<!-- AI-generated descriptions -->
<img alt="Game camera photo from Oak Stand showing 
          one deer (buck, 8-point) at 6:42 AM, 
          94% confidence">

<!-- When identified -->
<img alt="Big 8, 8-point buck, photographed at 
          Oak Stand on November 28, 2025">
Live Regions:

Processing queue updates: aria-live="polite"
Error messages: aria-live="assertive"
Match suggestions: aria-live="polite"

9.4 Motion & Animation
Reduced Motion:
Respect prefers-reduced-motion media query:

Disable skeleton pulse animations
Use instant transitions instead of animated
Disable parallax or scroll-based effects

Animation Timing:

Quick feedback: 150ms (button states)
Transitions: 200-300ms (panels, modals)
Content loading: 300-500ms (skeleton to content)

9.5 Touch Targets
Minimum touch target size: 44×44px
Ensure adequate spacing between touch targets to prevent mis-taps, especially important for the review queue where rapid decisions are made.

Appendix A: Design Tokens (CSS Variables)
css:root {
  /* Colors - Primary */
  --color-slate: #3D4A4D;
  --color-copper: #C4895A;
  --color-cream: #F5F0E8;
  --color-charcoal: #5A5D5E;
  --color-warm-gray: #8A8B87;
  
  /* Colors - Extended */
  --color-slate-deep: #2D3638;
  --color-slate-light: #4D5A5D;
  --color-cream-dark: #E8E3DB;
  
  /* Colors - Semantic */
  --color-success: #4A7C59;
  --color-warning: #D4A34A;
  --color-error: #C45A5A;
  --color-info: #5A8AC4;
  
  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  /* Font Sizes */
  --text-xs: 0.6875rem;
  --text-sm: 0.75rem;
  --text-base: 0.875rem;
  --text-lg: 1rem;
  --text-xl: 1.125rem;
  --text-2xl: 1.375rem;
  --text-3xl: 1.75rem;
  --text-4xl: 2.25rem;
  
  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-8: 48px;
  --space-10: 64px;
  
  /* Radii */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 8px rgba(0,0,0,0.25);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.3);
  
  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 300ms ease;
}

Appendix B: Tailwind Configuration
javascript// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        slate: {
          DEFAULT: '#3D4A4D',
          deep: '#2D3638',
          light: '#4D5A5D',
        },
        copper: {
          DEFAULT: '#C4895A',
          light: '#D49A6A',
          dark: '#B47A4A',
        },
        cream: {
          DEFAULT: '#F5F0E8',
          dark: '#E8E3DB',
        },
        charcoal: '#5A5D5E',
        'warm-gray': '#8A8B87',
        success: '#4A7C59',
        warning: '#D4A34A',
        error: '#C45A5A',
        info: '#5A8AC4',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
}

Document Version 1.0 — December 2025
TineSight Design System