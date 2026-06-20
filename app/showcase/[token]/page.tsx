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
    <main className="min-h-screen bg-slate-deep text-cream">
      <header className="border-b border-cream/10 px-5 py-6 text-center">
        <p className="text-xs uppercase tracking-widest text-copper">TineSight</p>
        <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-cream-dark">
          {bucks.length} trophy buck{bucks.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        {bucks.map((b) => (
          <article
            key={b.deerId}
            className="overflow-hidden rounded-xl bg-slate shadow-lg"
          >
            <div className="relative aspect-[4/3] w-full bg-slate-deep">
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
                <div className="flex h-full w-full items-center justify-center text-4xl">🦌</div>
              )}
              {b.score !== null && (
                <span className="absolute right-2 top-2 rounded-full bg-copper px-2.5 py-1 text-xs font-semibold text-white">
                  {b.score}&quot; gross
                </span>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-medium">{b.name}</h2>
              <span className="text-sm text-cream-dark">
                {b.sightings} sighting{b.sightings === 1 ? '' : 's'}
              </span>
            </div>
          </article>
        ))}
      </div>

      <footer className="px-5 py-8 text-center text-xs text-cream-dark">
        Powered by TineSight · AI-cataloged trophy bucks
      </footer>
    </main>
  )
}
