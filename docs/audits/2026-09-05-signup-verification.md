# Signup verification — 2026-09-05

## Found and fixed

A real browser signup created an auth user but stayed on `/signup` with no profile. The account-boundary provider performed a full-page reload on anonymous-to-authenticated transitions. That aborted the profile request, and no database trigger created the missing profile in the connected environment.

The provider now lets login/signup complete an initial sign-in without aborting their work; private account swaps and logout still tear down the old account view and clear private state. The auth form subtree remains mounted during initial sign-in.

Profile setup now requires a verified session and derives the ID, email, and name from that session. It is idempotent and preserves existing profiles. Both signup and login await setup and surface failures, so interrupted registrations can recover on login.

Signup with an immediate session enters `/photos`. A no-session signup shows email confirmation instructions and requests an `/auth/callback` redirect. Email confirmation is disabled in the connected project, so email delivery and the confirmation callback were not exercised.

## Verification

- Created two disposable accounts through the browser; both were deleted along with their profiles after testing.
- Before fix: signup user existed, profile did not, browser remained on signup.
- After fix: fresh signup reached `/photos`, profile existed with the submitted name, password login succeeded.
- Existing incomplete registration was repaired by login.
- Anonymous profile setup returns 401.
- All seven account-boundary regression tests pass.
- Targeted lint and project type check pass.
- Signup checked at 390 × 844 and 360 × 800, plus 360 × 430 for reduced available height. Inputs and submit control measure 48px high; input text is 16px. Autofill metadata, validation, and password visibility were checked. No horizontal overflow.
- Desktop signup checked at 1440 × 1000.
- These are Chromium browser checks at mobile viewport sizes; physical iPhone/Safari and Android devices were not tested.

## Remaining blocker outside signup

The authenticated photo library returns HTTP 500 because the connected database lacks `images.triage_tier` (Postgres 42703). This also prevents triage counts from loading. The local photo workflow and connected schema need alignment before the complete first-use experience can be considered ready. No shared database migrations were applied during this signup work.

## Follow-up hardening

- Added a dashboard profile gate to recover an interrupted signup or an admin-created account before private UI is available. The callback, authenticated profile endpoint, and dashboard fallback share an idempotent server-only helper.
- Verified with a disposable account whose profile was absent: installed its signed-in session without calling client profile setup, opened `/dashboard`, and confirmed the server created its profile.
- Login banners now accept fixed message codes only. Callback redirects reject external destinations and backslashes; the homepage forwards fallback PKCE codes to the callback. Token-hash OTP callbacks are supported, including recovery routing, but hosted email templates/redirect allowlists were not changed or exercised.
- Public pages remain public on cross-tab sign-out; auth form completion keeps control of its own navigation.
- Ten boundary/navigation regression tests pass.
