# Quickstart: Minimal SaaS Foundation

**Feature**: 001-saas-foundation
**Estimated Setup Time**: 30 minutes

## Prerequisites

- [ ] Node.js 18+ installed
- [ ] npm or pnpm package manager
- [ ] Supabase account with project created
- [ ] Supabase API credentials (URL, anon key, service role key)
- [ ] Git installed

## Environment Setup

### 1. Clone and Install

```bash
# Navigate to project directory
cd /home/clachance14/projects/TineView

# Initialize Next.js project (if not exists)
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias="@/*"

# Install dependencies
npm install @supabase/supabase-js @supabase/ssr lucide-react
npm install --save-dev supabase
```

### 2. Configure Environment Variables

Create `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Initialize shadcn/ui

```bash
npx shadcn-ui@latest init

# Select options:
# - Style: Default
# - Base color: Slate
# - CSS variables: Yes
# - tailwind.config.ts: Yes
# - components.json location: Default
# - Import alias: @/components
# - Utils alias: @/lib/utils

# Install required components
npx shadcn-ui@latest add button card input label form avatar dropdown-menu separator
```

### 4. Setup Database

```bash
# Link to Supabase project
npx supabase login
npx supabase link --project-ref your-project-ref

# Apply migrations (run in Supabase SQL Editor)
# Copy contents of supabase/migrations/001_initial_schema.sql

# Generate TypeScript types
npx supabase gen types typescript --linked > types/database.ts
```

## Quick Verification

### Run Development Server

```bash
npm run dev
# Open http://localhost:3000
```

### Test Auth Flow

1. Navigate to `/signup`
2. Create account with email/password
3. Check email for confirmation link (or Supabase Inbucket if local)
4. Click confirmation link
5. Navigate to `/login`
6. Sign in with credentials
7. Verify redirect to `/dashboard`
8. Click "Sign Out" in header dropdown
9. Verify redirect to `/login`

### Verify Database

```sql
-- Run in Supabase SQL Editor

-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Check RLS enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public';

-- Check profile was created
SELECT * FROM profiles;
```

## Directory Structure After Setup

```
TineView/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── forgot-password/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── photos/page.tsx
│   │   ├── deer/page.tsx
│   │   ├── cameras/page.tsx
│   │   └── settings/page.tsx
│   ├── auth/callback/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── auth/
│   ├── dashboard/
│   └── ui/
├── lib/
│   └── supabase/
│       ├── client.ts
│       ├── server.ts
│       └── middleware.ts
├── types/
│   ├── database.ts
│   └── index.ts
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── middleware.ts
├── tailwind.config.ts
├── .env.local
└── package.json
```

## Common Issues

### "Invalid API key" error
- Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
- Restart dev server after changing env vars

### Email confirmation not working
- Check Supabase Dashboard → Authentication → Email Templates
- For local dev, use Supabase Inbucket (Dashboard → Settings → Auth → Inbucket)

### Profile not created on signup
- Verify `handle_new_user()` trigger exists
- Check Supabase Logs for trigger errors

### RLS blocking queries
- Verify you're authenticated (check cookies)
- Run query as authenticated user in Supabase SQL Editor

## Next Steps

After completing setup:

1. Run `/speckit.tasks` to generate implementation tasks
2. Run `/speckit.implement` to execute tasks
3. Test all user stories from spec.md

## Reference Documents

- [spec.md](./spec.md) - Feature specification
- [plan.md](./plan.md) - Implementation plan
- [data-model.md](./data-model.md) - Database schema details
- [research.md](./research.md) - Technical decisions
- [contracts/auth-api.yaml](./contracts/auth-api.yaml) - API contract
