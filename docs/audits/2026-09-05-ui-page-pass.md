# User-facing UI pass — September 5, 2026

Kept the existing forest, parchment, brass, and Fraunces design system. Extended the homepage/auth direction across the signed-in application. No deployment performed.

## Page coverage

| Pages | Changes |
| --- | --- |
| Homepage, login, signup | Selected Kyle Underwood photo; clearer product explanation; larger branding; form accessibility and mobile sizing. Compressed the hero to 133 KB WebP and sighting crops to 24–28 KB. Removed hidden auth-aside preloads. |
| Forgot/reset password | Matching typography, larger fields/actions, home/back links, semantic headings, and visible password-update feedback on login. |
| Overview | Useful upload and collection entry points replacing placeholder metrics. |
| Photos and photo detail | Consistent heading; actionable empty state; shared navigation and touch controls; corrected detail heading font. Existing photo filtering, viewer, and upload work remains intact. |
| Deer catalog and buck profile | Search/sort/view accessibility, clear empty/error recovery, larger actions, restrained numeric styling. Sightings precede antler details on mobile; unavailable antler data has a compact explanation. |
| Review | Shared heading, wrapping section controls, touch sizing, and mobile action layout. |
| Upload | Clearer heading and tab labels, less repeated introductory content, larger file/folder controls. |
| Locations | Map fills the workspace without page scrolling. Saved locations and selected details live in an independently scrolling left panel; phones use a collapsible Places panel. Hover/focus preview, click/tap persistence, one close control, direct wheel zoom, satellite/terrain toggle, coordinate entry, larger create/edit controls, and a usable map-unavailable fallback. |
| Cameras | Useful empty/error states and camera cards that open filtered photos. |
| Settings | Readable account details, wrapping email addresses, membership information, and password-reset entry point. |
| Showcase manager and public showcase | Clear creation steps, selected states, loading/error handling, accurate copy feedback, public preview link, responsive gallery, and consistent typography. Removed the AI-cataloged footer wording. |
| Unavailable/error pages | Branded unavailable-page experience and a signed-in retry/overview route. |

Shared changes include desktop/sidebar navigation, mobile bottom navigation, skip link, keyboard focus styles, dialog scrolling and close targets, button contrast, and reduced-motion handling.

## Verification

- Browser walkthrough of overview, photos, deer, review, upload, locations, cameras, showcase, and settings at 390 × 844 and 1440 × 900. Body and workspace widths stayed within the viewport.
- Populated photo detail, buck profile, and public showcase checked with temporary test records. Detail pages returned 200 and fit both phone and desktop widths; public showcase fit 390px.
- Locations checked at 320 × 740, 390 × 844, and 1440 × 900. Main scroll height equaled its client height. Create and edit persisted successfully. Hover displayed details; click kept them open; the single close control dismissed them. Wheel event without Ctrl changed map tiles without a Ctrl prompt.
- Forgot/reset password checked at 360 × 800. Password-update feedback appeared on login. Homepage rendered without an inert wrapper and used the compressed Kyle photo.
- Tested signing up as a second account while another account was signed in, then signing back into the first account. Profile creation completed and each account showed its own data. Sign-out returned to login.
- Ten auth boundary/navigation regression tests passed. Targeted UI lint passed. TypeScript validation passed against the current shared working tree.
- Temporary accounts, locations, buck/photo/showcase records, and three storage objects were removed; per-account record counts verified zero.

These are browser viewport checks, not tests on physical iPhones or Android devices. No password-reset email was sent, and no image-analysis jobs were launched during this UI pass.
