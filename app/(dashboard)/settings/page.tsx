import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageHeading } from '@/components/layout/page-heading'
import type { Profile } from '@/types/database'

export default async function SettingsPage(): Promise<React.JSX.Element> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile: Profile | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single<Profile>()
    profile = data
  }

  const fullName = profile?.full_name?.trim() ?? ''
  const name = fullName.length > 0 ? fullName : 'Your account'
  const initial = (
    profile?.full_name?.[0] ??
    user?.email?.[0] ??
    'U'
  ).toUpperCase()
  const tier = profile?.subscription_tier ?? 'Unavailable'
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeading
        eyebrow="Make yourself at home"
        title="Settings"
        description="Your account details and sign-in settings."
      />
      <section className="max-w-3xl rounded-xl border border-forest-light bg-forest/20 p-5 sm:p-8">
        <div className="flex items-center gap-4 border-b border-forest-light pb-6">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-brass/30 font-display text-2xl text-brass">
            {initial}
          </div>
          <div className="min-w-0">
            <h2 className="break-words font-display text-2xl">{name}</h2>
            <p className="mt-1 break-all text-sm text-weathered">
              {user?.email}
            </p>
          </div>
        </div>
        <dl className="grid gap-6 py-7 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-weathered">Full name</dt>
            <dd className="mt-2 break-words text-sm">
              {fullName.length > 0 ? fullName : 'Not provided'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-weathered">Email address</dt>
            <dd className="mt-2 break-all text-sm">
              {user?.email ?? 'Unavailable'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-weathered">Current plan</dt>
            <dd className="mt-2 font-mono text-sm capitalize text-brass-light">
              {tier}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-weathered">Member since</dt>
            <dd className="mt-2 font-mono text-sm">
              {profile?.created_at != null
                ? new Date(profile.created_at).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Unavailable'}
            </dd>
          </div>
        </dl>
        <div className="flex flex-col items-start justify-between gap-4 border-t border-forest-light pt-6 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm">Password & sign-in</h3>
            <p className="mt-2 text-sm leading-6 text-weathered">
              Request an email link to choose a new password.
            </p>
          </div>
          <Button asChild className="min-h-12 shrink-0">
            <Link href="/forgot-password">Reset password</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
