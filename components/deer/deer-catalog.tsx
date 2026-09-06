'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { PageState } from '@/components/layout/page-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Image as ImageIcon, LayoutGrid } from 'lucide-react'
import { DeerCatalogCard, type CatalogDeer, type CatalogView } from './deer-catalog-card'
import { DeerHeroImage } from './deer-hero-image'

interface DeerProfile extends CatalogDeer {
  notes: string | null
  created_at: string
}

interface DeerCatalogProps {
  onDeerClick?: (deer: DeerProfile) => void
}

type SortKey = 'score' | 'recent' | 'trophy'

function sortDeer(deer: DeerProfile[], key: SortKey): DeerProfile[] {
  const by = [...deer]
  if (key === 'score') by.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  else if (key === 'recent') by.sort((a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? ''))
  else by.sort((a, b) => {
    const byTrophy = Number(b.is_trophy) - Number(a.is_trophy)
    return byTrophy !== 0 ? byTrophy : (b.score ?? -1) - (a.score ?? -1)
  })
  return by
}

export function DeerCatalog({ onDeerClick }: DeerCatalogProps): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('score')
  const [view, setView] = useState<CatalogView>('immersive')

  const { data, isLoading, error, refetch } = useQuery<{ deer: DeerProfile[] }>({
    queryKey: ['deer-catalog', search],
    queryFn: async (): Promise<{ deer: DeerProfile[] }> => {
      const url = search.length > 0 ? `/api/deer?search=${encodeURIComponent(search)}` : '/api/deer'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch catalog')
      return res.json() as Promise<{ deer: DeerProfile[] }>
    },
  })

  const deer = useMemo(() => data?.deer ?? [], [data])
  const sorted = useMemo(() => sortDeer(deer, sort), [deer, sort])

  // Featured = highest-Score buck with a photo. Only in immersive view, no search.
  const featured = useMemo(() => {
    if (view !== 'immersive' || search.length > 0) return null
    const candidates = deer.filter((d) => d.score != null && d.reference_image_url != null && d.reference_image_url !== '')
    if (candidates.length === 0) return null
    return candidates.reduce((best, d) => ((d.score ?? -1) > (best.score ?? -1) ? d : best))
  }, [deer, view, search])

  const gridDeer = featured ? sorted.filter((d) => d.id !== featured.id) : sorted

  if (error) {
    return <PageState error title="Your catalog couldn’t load." description="Try again to reconnect to your saved bucks."><Button onClick={() => { void refetch() }}>Try again</Button></PageState>
  }

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-dark" />
        <Input
          aria-label="Search bucks by name"
          placeholder="Search the catalog…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-12 pl-9"
        />
      </div>

      {/* Placard: count · sort controls · view toggle */}
      {!isLoading && deer.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream/10 pb-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-cream-dark">
            The Catalog · {deer.length} Buck{deer.length === 1 ? '' : 's'}
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[0.12em]">
              {([['score', 'Score'], ['recent', 'Last seen'], ['trophy', 'Trophies']] as const).map(([k, label]) => (
                <button
                  key={k}
                  aria-pressed={sort === k}
                  onClick={() => setSort(k)}
                  className={`min-h-11 ${sort === k ? 'text-copper' : 'text-cream-dark hover:text-cream'}`}
                >
                  {label}{sort === k ? ' ▾' : ''}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-lg border border-cream/10">
              <button
                onClick={() => setView('immersive')}
                aria-label="Immersive view"
                aria-pressed={view === 'immersive'}
                className={`flex min-h-11 items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold ${view === 'immersive' ? 'bg-slate-light text-cream' : 'text-cream-dark hover:text-cream'}`}
              >
                <ImageIcon className="h-3.5 w-3.5" /> Immersive
              </button>
              <button
                onClick={() => setView('compact')}
                aria-label="Compact view"
                aria-pressed={view === 'compact'}
                className={`flex min-h-11 items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold ${view === 'compact' ? 'bg-slate-light text-cream' : 'text-cream-dark hover:text-cream'}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Compact
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-xl" />
          ))}
        </div>
      ) : deer.length === 0 ? (
        <PageState title={search.length > 0 ? 'No bucks match that name.' : 'Every buck has a story.'} description={search.length > 0 ? 'Try another name, or clear your search to see the full catalog.' : 'Upload your trail camera photos, then review sightings and name your first buck to start your collection.'}>
          {search.length > 0 ? <Button onClick={() => setSearch('')}>Clear search</Button> : <div className="flex flex-wrap gap-3"><Button asChild><Link href="/upload">Upload photos</Link></Button><Button asChild variant="outline"><Link href="/trophy">Review sightings</Link></Button></div>}
        </PageState>
      ) : (
        <div className="space-y-5">
          {/* Featured hero */}
          {featured && (
            <Link
              href={`/deer/${featured.id}`}
              onClick={() => onDeerClick?.(featured)}
              className="group relative block overflow-hidden rounded-2xl border border-copper/45 shadow-[0_26px_60px_-30px_#000]"
            >
              <div className="relative aspect-[5/4] overflow-hidden sm:aspect-[21/9]">
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 bg-gradient-to-r from-transparent via-brass-light to-transparent" />
                <DeerHeroImage imageUrl={featured.reference_image_url as string} bbox={featured.reference_bbox ?? null} alt={featured.name} />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-brass-light">Featured · Highest Score</div>
                <h2 className="mt-1.5 font-display text-4xl font-semibold leading-none text-cream drop-shadow-[0_3px_18px_rgba(0,0,0,0.6)] sm:text-5xl">{featured.name}</h2>
                <div className="mt-3 flex flex-wrap items-end gap-5">
                  {featured.score != null && (
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-brass-light/80">Gross Score</div>
                      <div className="font-mono text-5xl font-bold leading-none text-brass-light tabular-nums sm:text-6xl">{featured.score}</div>
                    </div>
                  )}
                  <div className="text-sm text-cream-dark">
                    {featured.sighting_count} sighting{featured.sighting_count === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            </Link>
          )}

          {/* Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {gridDeer.map((d) => (
              <DeerCatalogCard key={d.id} deer={d} view={view} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
