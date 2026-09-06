import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

// Public, no-login marketing page (ADR 0001). Never indexed; rendered fresh per
// request so a revoked link stops working immediately (also see no-store header
// in next.config.ts).
export const metadata: Metadata = {
  title: 'Trophy Showcase',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

interface ShowcasePageProps {
  params: Promise<{ token: string }>
}

const SIGNED_URL_TTL_SECONDS = 300 // short: limits validity of any leaked image URL after revocation

export default async function ShowcasePage({ params }: ShowcasePageProps): Promise<React.JSX.Element> {
  const { token } = await params

  // Service-role client used ONLY to (1) call the sanitizing RPC and (2) sign the
  // medium image paths the RPC returns. No raw table reads (Codex blast-radius).
  const supabase = createAdminClient()

  const { data: rows, error } = await supabase.rpc('get_public_showcase', { p_token: token })

  // Identical 404 for revoked, absent, or errored — no revoked-vs-missing oracle.
  if (error !== null || rows === null || rows.length === 0) {
    notFound()
  }

  const title = rows[0]?.showcase_title ?? 'Trophy Showcase'

  const bucks = await Promise.all(
    rows.map(async (r) => {
      let imageUrl: string | null = null
      if (r.image_path != null && r.image_path !== '') {
        const { data } = await supabase.storage
          .from('photos')
          .createSignedUrl(r.image_path, SIGNED_URL_TTL_SECONDS)
        imageUrl = data?.signedUrl ?? null
      }
      return {
        deerId: r.deer_id,
        name: r.buck_name,
        score: r.is_trophy ? r.score_gross : null,
        sightings: r.sighting_count,
        imageUrl,
      }
    })
  )

  return (
    <main className="min-h-dvh bg-deep-forest text-parchment">
      <header className="mx-auto max-w-6xl border-b border-forest-light px-5 pb-8 pt-10 sm:px-8 sm:pt-14">
        <Link href="/" className="inline-flex min-h-11 items-center font-display text-2xl tracking-[0.12em] text-brass">TINESIGHT</Link>
        <p className="mt-10 text-[11px] uppercase tracking-[0.18em] text-weathered">A collection from the field</p>
        <h1 className="mt-3 break-words font-display text-4xl sm:text-5xl">{title}</h1>
        <p className="mt-4 font-mono text-xs text-weathered">
          {bucks.length} buck{bucks.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-5 py-8 sm:grid-cols-2 sm:px-8 lg:grid-cols-3">
        {bucks.map((b) => (
          <article
            key={b.deerId}
            className="overflow-hidden rounded-xl border border-forest-light bg-forest/20"
          >
            <div className="relative aspect-[4/5] w-full bg-slate-deep">
              {b.imageUrl !== null ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={b.imageUrl}
                  alt={b.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-6xl text-weathered/40" aria-label="No photo available">{b.name.slice(0, 1)}</div>
              )}
              {b.score !== null && (
                <span className="absolute right-2 top-2 rounded-md border border-brass/40 bg-deep-forest/90 px-3 py-2 font-mono text-xs text-brass-light">
                  {b.score}&quot; gross
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5">
              <h2 className="break-words font-display text-2xl italic">{b.name}</h2>
              <span className="text-sm text-cream-dark">
                {b.sightings} sighting{b.sightings === 1 ? '' : 's'}
              </span>
            </div>
          </article>
        ))}
      </div>

      <footer className="px-5 py-8 text-center text-xs text-cream-dark">
        Collected in TineSight · Every buck has a story.
      </footer>
    </main>
  )
}
