# Feature Specification: Minimal SaaS Foundation

**Feature Branch**: `001-saas-foundation`
**Created**: 2025-12-01
**Status**: Draft
**MVP Phase**: 0-1 (Infrastructure + Auth)

## Product Context

This feature implements **Phases 0-1** of the TineSight MVP as defined in the [Product Vision](../../.specify/memory/product-vision.md).

| Aspect | Summary |
|--------|---------|
| **Problem** | Hunting lease operators waste hours sorting game camera photos and can't track individual bucks |
| **Target User** | Hunting lease operator running commercial hunting operation |
| **North Star** | First Buck Re-Identified (AI matches buck across photos, user confirms) |
| **This Feature** | Foundation infrastructure enabling future photo upload and AI identification |

This feature establishes the authentication, database schema, and navigation shell. It does not deliver the core value proposition directly but is a prerequisite for all subsequent features.

---

**Input**: User description: "Minimal SaaS Foundation with Auth, Database, and Dashboard - Auth + DB + layout only (defer Stripe payments)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Account Creation (Priority: P1)

New users can create an account with TineSight to begin using the deer tracking application.

**Why this priority**: Account creation is the gateway to all functionality. Without accounts, no other features can be accessed. This is the absolute minimum for any SaaS application.

**Independent Test**: Can be fully tested by navigating to signup page, creating an account with email/password/name, confirming email, and verifying the user can access the authenticated area.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user on the signup page, **When** they enter a valid email, password (min 8 characters), and full name, **Then** an account is created and a confirmation email is sent
2. **Given** a user who received a confirmation email, **When** they click the confirmation link, **Then** their account is verified and they can log in
3. **Given** a user attempting signup with an existing email, **When** they submit the form, **Then** they see an error message indicating the email is already registered
4. **Given** a user entering an invalid email format, **When** they submit the form, **Then** form validation prevents submission and shows an error

---

### User Story 2 - User Authentication (Priority: P1)

Registered users can log in and log out of TineSight securely.

**Why this priority**: Authentication is fundamental - users must be able to access their data securely. Combined with User Story 1, this completes the basic access control.

**Independent Test**: Can be fully tested by logging in with valid credentials and verifying dashboard access, then signing out and verifying redirect to login.

**Acceptance Scenarios**:

1. **Given** a user with verified credentials on the login page, **When** they enter correct email and password, **Then** they are redirected to the dashboard
2. **Given** an authenticated user, **When** they click "Sign Out", **Then** their session ends and they are redirected to the login page
3. **Given** a user entering incorrect credentials, **When** they submit the login form, **Then** they see an error message and remain on the login page
4. **Given** an unauthenticated user, **When** they try to access any dashboard URL directly, **Then** they are redirected to the login page

---

### User Story 3 - Password Recovery (Priority: P2)

Users who forget their password can reset it via email.

**Why this priority**: Essential for user retention but not blocking for initial testing. Users can still create new accounts if needed.

**Independent Test**: Can be fully tested by requesting password reset, receiving email, clicking link, setting new password, and logging in with new credentials.

**Acceptance Scenarios**:

1. **Given** a user on the forgot-password page, **When** they enter their registered email, **Then** a password reset email is sent
2. **Given** a user with a reset link, **When** they click the link and enter a new password, **Then** their password is updated
3. **Given** a user who reset their password, **When** they log in with the new password, **Then** they successfully access the dashboard
4. **Given** a user entering an unregistered email, **When** they request a reset, **Then** they see a success message (no indication of account existence for security)

---

### User Story 4 - Dashboard Navigation (Priority: P2)

Authenticated users can navigate between different sections of the application using a sidebar.

**Why this priority**: Provides the shell for future features. Without navigation, users cannot access different parts of the application.

**Independent Test**: Can be fully tested by logging in and clicking each navigation item, verifying the correct page loads and navigation state updates.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the dashboard, **When** they view the sidebar, **Then** they see navigation items for Dashboard, Photos, Deer, Cameras, and Settings
2. **Given** an authenticated user, **When** they click a navigation item, **Then** they are taken to the corresponding page and the nav item shows as active
3. **Given** an authenticated user, **When** they view the header, **Then** they see their avatar/initials and a dropdown with Settings and Sign Out options

---

### User Story 5 - User Profile Display (Priority: P3)

Users can view their profile information on the dashboard and settings page.

**Why this priority**: Nice to have for user awareness but not critical for core functionality.

**Independent Test**: Can be fully tested by logging in and verifying name displays in header and profile information appears on settings page.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they view the dashboard header, **Then** they see their initials in an avatar
2. **Given** an authenticated user on the settings page, **When** they view their profile section, **Then** they see their email, name, and subscription tier (free by default)

---

### Edge Cases

- What happens when a user's session expires while on a protected page? (Automatic redirect to login on next request)
- How does the system handle rapid successive login attempts? (Standard rate limiting via auth provider)
- What happens if email confirmation link is clicked after expiration? (Error message with option to request new link)
- How does the system handle browser back button after logout? (Protected pages redirect to login)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to create accounts with email, password, and full name
- **FR-002**: System MUST send email confirmation for new account registrations
- **FR-003**: System MUST validate email format and password strength (minimum 8 characters)
- **FR-004**: System MUST allow users to sign in with email and password
- **FR-005**: System MUST allow users to sign out, ending their session
- **FR-006**: System MUST protect all dashboard routes from unauthenticated access
- **FR-007**: System MUST redirect unauthenticated users attempting to access protected routes to the login page
- **FR-008**: System MUST allow users to request password reset via email
- **FR-009**: System MUST allow users to set a new password via reset link
- **FR-010**: System MUST automatically create a user profile when an account is created
- **FR-011**: System MUST display user information (name, email, tier) in the dashboard
- **FR-012**: System MUST provide navigation between Dashboard, Photos, Deer, Cameras, and Settings sections
- **FR-013**: System MUST visually indicate the currently active navigation section
- **FR-014**: System MUST enforce data isolation - users can only see their own data
- **FR-015**: System MUST store database schema for future features (cameras, images, deer, detections)
- **FR-016**: System MUST apply consistent visual styling following the TineSight design system (dark mode, copper accent)

### Key Entities

- **User/Profile**: Represents an authenticated user with email, full name, subscription tier (free/pro/ranch), and creation timestamp
- **Camera**: Location where game camera is deployed (name, coordinates, notes) - schema only, UI deferred
- **Image**: Uploaded photo from game camera (file reference, capture time, classification status) - schema only
- **Deer**: Individual identified deer (name, tags, first/last seen dates, notes) - schema only
- **Detection**: AI detection within an image (bounding box, classification, confidence) - schema only
- **Team Member**: Links users to accounts for collaboration (role: owner/viewer) - schema only

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete account creation (signup through email confirmation) in under 3 minutes
- **SC-002**: Users can sign in and reach the dashboard in under 10 seconds
- **SC-003**: 100% of protected routes redirect unauthenticated users to login
- **SC-004**: Password reset flow completes successfully (request through new login) in under 5 minutes
- **SC-005**: Navigation between all 5 dashboard sections works without errors
- **SC-006**: User profile information displays correctly after login
- **SC-007**: Sign out successfully ends session and prevents access to protected content
- **SC-008**: All database tables are created with proper data isolation (users cannot access other users' data)
- **SC-009**: Application builds and deploys without errors
- **SC-010**: Visual styling matches design system (dark theme, correct color palette, proper typography)

## Assumptions

- Email delivery is handled by the authentication provider (Supabase)
- Users will confirm their email addresses (email confirmation is enabled)
- Single sign-on (OAuth) is not required for MVP (email/password only for foundation)
- Subscription tier defaults to "free" for all new users (Stripe integration deferred)
- Team member invitation flow is deferred (schema only)
- Photo upload and AI processing are deferred (placeholder pages only)
- Mobile-specific optimizations are deferred (responsive but not mobile-first)

## Out of Scope

- Payment processing and subscription management (Stripe integration)
- Image upload and storage functionality
- AI-powered animal detection and deer identification
- Background job processing
- Transactional email notifications (beyond auth emails)
- Analytics and error tracking instrumentation
- Team member invitation and collaboration features
- Mobile-native optimizations

## Dependencies

- Supabase project with Auth and Database enabled
- Valid Supabase API credentials (URL, anon key, service role key)
- Domain configured for email delivery (or using Supabase's default)
