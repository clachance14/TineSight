# Research: Minimal SaaS Foundation

**Feature**: 001-saas-foundation
**Date**: 2025-12-01

## Research Tasks Completed

### 1. Supabase SSR Authentication Pattern

**Decision**: Use `@supabase/ssr` package with cookie-based session management

**Rationale**:
- Official recommended pattern for Next.js 14 App Router
- `@supabase/auth-helpers-nextjs` is deprecated
- Proper server-side token validation with `getUser()` (not `getSession()`)
- Cookie-based sessions work with serverless edge functions

**Alternatives Considered**:
- `@supabase/auth-helpers-nextjs` - Deprecated, do not use
- Custom JWT handling - Unnecessary complexity, reinventing the wheel
- Client-only auth - Security risk, session can be spoofed

**Implementation Pattern**:
```typescript
// lib/supabase/server.ts - MUST use getAll/setAll for cookies
cookies: {
  getAll() { return cookieStore.getAll() },
  setAll(cookiesToSet) { /* ... */ }
}

// Always use getUser() for server-side auth checks
const { data: { user } } = await supabase.auth.getUser()
```

**Sources**:
- [Supabase SSR Docs](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Creating a Supabase Client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)

---

### 2. Next.js 14 Middleware for Route Protection

**Decision**: Use middleware.ts at project root with route matcher

**Rationale**:
- Runs before every request, can refresh tokens and redirect
- Official Next.js pattern for protected routes
- Works with Supabase SSR pattern

**Alternatives Considered**:
- Layout-based auth checks - Race conditions, flash of content
- API route wrappers - Doesn't protect page routes
- Higher-order components - Client-side only, not secure

**Implementation Pattern**:
```typescript
// middleware.ts
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

---

### 3. Row-Level Security (RLS) for Multi-Tenant Isolation

**Decision**: Enable RLS on all tables with `auth.uid()` policies

**Rationale**:
- Constitution Principle III requires database-level isolation
- Defense-in-depth: bugs in application code cannot leak data
- Supabase enforces RLS automatically for anon/authenticated roles

**Key Patterns**:
```sql
-- Direct ownership
CREATE POLICY "Users can view own data" ON cameras
  FOR SELECT USING (auth.uid() = user_id);

-- Team access via helper function
CREATE OR REPLACE FUNCTION has_account_access(account_owner_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    auth.uid() = account_owner_id OR
    EXISTS (
      SELECT 1 FROM team_members
      WHERE account_id = account_owner_id
      AND user_id = auth.uid()
      AND accepted_at IS NOT NULL
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### 4. Auto-Profile Creation on Signup

**Decision**: Use PostgreSQL trigger on `auth.users` insert

**Rationale**:
- Guarantees profile exists for every user
- Works regardless of signup method (email, OAuth, magic link)
- Application code doesn't need to handle profile creation

**Implementation**:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### 5. TailwindCSS Design System Integration

**Decision**: Extend Tailwind config with TineSight color palette

**Rationale**:
- Constitution Principle VII requires design system compliance
- Custom colors allow `bg-slate-deep`, `text-copper`, etc.
- shadcn/ui components inherit theme automatically

**Color Palette**:
| Name | Value | Usage |
|------|-------|-------|
| slate-deep | #2D3638 | Primary background |
| slate | #3D4A4D | Header, elevated surfaces |
| slate-light | #4D5A5D | Active states |
| copper | #C4895A | Primary accent, CTAs |
| copper-light | #D49A6A | Hover states |
| cream | #F5F0E8 | Primary text |
| cream-dark | #E8E3DB | Secondary text |

---

### 6. shadcn/ui Component Selection

**Decision**: Install minimal set of components for MVP

**Components Needed**:
- `button` - Primary actions
- `card` - Content containers
- `input` - Form fields
- `label` - Form labels
- `form` - Form validation
- `avatar` - User initials
- `dropdown-menu` - User menu
- `separator` - Visual dividers

**Not Needed Yet**:
- `dialog` - No modals in MVP
- `table` - No data tables
- `tabs` - Deferred to feature pages

---

## Resolved Clarifications

All technical decisions have been made based on:
1. Constitution principles
2. Official documentation best practices
3. TineSight MVP Documents specifications

No outstanding clarifications needed.
