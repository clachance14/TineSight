# Upload UI verification

Adding supported files, selecting a folder, or dropping photos automatically opens the location dialog with its map visible. Saved pins select existing locations; clicking a new map point opens the creation form with coordinates filled in.

The folder flow now presents three steps: choose photos, set the group location, and review before upload. Selecting a location or explicitly continuing without one returns to review. Closing the dialog never starts a transfer. Creating a location saves it through the existing locations API before using the returned ID. Coordinate entry supports creating locations without a map.

The simple uploader preserves saved location IDs and displays the current group location. Both flows share the location dialog. Folder assignments override the group location; replacing a group clears its assignments and location choice.

## Automated checks

- `npm run test:ui`: 44 interaction tests across the location dialog, bulk upload flow, and simple uploader integration.
- `npm run test:unit`: 166 existing regression tests passed, including transfer acknowledgments, cancellation, retries, duplicates, worker failures and recovery.
- `npm run type-check`: passed.
- `npm run build`: passed.
- Scoped ESLint for the upload page, upload components, UI tests and Vitest configuration: passed.

The photo selection toolbar required an additional `onClose` callback for the shared dialog. Its pre-existing lint errors were reproduced against the HEAD version and remain outside this change.

## UI coverage

- Group count, selected-file review, per-folder camera/location choices, clear and replacement behavior.
- Map visible on opening, saved-pin selection, map-point creation, switching from draft to saved pins, and automatic opening for files, folders and drops.
- Existing locations, including ID preservation and north-facing direction (`0`).
- New location API payload, trimmed names, zero coordinates, missing and out-of-range coordinates.
- Save failure with retained input, pending-save navigation lock, duplicate submission prevention.
- Explicit skip, Back, Close and Escape; dismissal preserves prior location choices.
- Saved-location loading/error/retry states.
- Review before upload, preparation progress, unsupported and partially rejected groups.
- Preparation failure recovery and duplicate-only completion with next actions.

## Boundaries

UI tests use jsdom and mock upload infrastructure; location-creation tests exercise the real mutation hook with mocked HTTP responses. These checks do not upload to live storage or verify Google Maps rendering, real browser layout, or the deployed analysis pipeline. Those integrations still need a browser acceptance pass using a test account and representative camera photos.

## Fixed map window

The location dialog uses a viewport-bounded flex layout with scrolling disabled. The map fills the remaining space, with a compact saved-location selector overlaid on it. Confirm appears after choosing a saved pin or new point. New points expose only a name input in the bottom bar; direction and notes are no longer part of this upload step. Tests cover conditional confirmation, naming validation and the fixed-window layout classes. Actual pixel layout remains subject to the browser acceptance pass described above.

## Review window

Both upload modes open a compact review dialog after location confirmation or explicit skip. The dialog groups photo count, size and location above a full-width Upload button. The outer window cannot scroll; the Upload footer cannot shrink. Optional folder settings and file names scroll independently inside the window, so they cannot push the upload action out of view. Closing review retains the selection and offers a Review & upload action to return. Short viewports use reduced padding. Four focused review tests cover the summary, primary action, footer separation from expanded details, and safe secondary actions.

## Gallery completion refresh regression

A completed upload session previously cleared its active tracker without invalidating cached gallery rows. Independently, repeated poll-option evaluations backed pending gallery rows off to 30 seconds. The UI could therefore keep showing processing after all originals, previews and analysis had completed; a manual reload fetched the current rows immediately.

`npx vitest run tests/ui/upload-completion-refresh.test.tsx` reproduces the stale tile with the actual session and gallery hooks, a pre-populated pending gallery cache and a completed stats response. It failed before the fix (Still processing after 1 second) and passes after the fix. It also exercises the page/status-bar double subscription and checks that they share one refresh. Completion invalidates photo queries once per subscriber/session without cancelling an already-running refresh, while excluding session-stats queries to avoid a loop.

`node --test lib/photos/query-regression.test.ts` covers steady three-second polling for visible pending analysis/previews, even after repeated observer updates or a realtime connection. Settled and empty filtered galleries retain the slower background refresh.
