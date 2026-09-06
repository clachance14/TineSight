import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ArrowRight } from 'lucide-react'

const SIGHTINGS = [
  { src: '/landing/sighting-1.webp', time: '8:23 AM' },
  { src: '/landing/sighting-2.webp', time: '9:13 AM' },
  { src: '/landing/sighting-3.webp', time: '9:34 AM' },
] as const

const FEATURES = [
  {
    number: '01',
    label: 'SORT THE PHOTOS',
    title: 'Less scrolling. More finding.',
    description: 'Bring your trail-camera photos into one library. Filter by date, location, and animal to get back to the shots you care about, without digging through folders.',
    detail: 'Photo uploads · Animal detection · Filters',
  },
  {
    number: '02',
    label: 'CONNECT THE SIGHTINGS',
    title: 'Seen him before? Put a name to him.',
    description: 'TineSight compares antlers and other visual features to suggest matches with bucks in your catalog. Review the photos and confirm which sightings belong together.',
    detail: 'Suggested matches · Side-by-side review · Named bucks',
  },
  {
    number: '03',
    label: 'BUILD THE RECORD',
    title: 'A whole season behind every name.',
    description: 'Give each buck a profile with his photos and sighting history. Come back to a familiar animal, compare his appearances, and keep adding to the record as new photos arrive.',
    detail: 'Individual profiles · Sighting history · Photo catalog',
  },
  {
    number: '04',
    label: 'SHOW YOUR PROPERTY',
    title: 'A collection worth sharing.',
    description: 'Choose bucks from your catalog and create a showcase link for prospective hunters. Give them a closer look at the animals on your property, with a presentation made for browsing.',
    detail: 'Selected bucks · Shareable showcases · Mobile viewing',
  },
] as const

export function LandingPage(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-deep-forest text-parchment">
      <header className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-6 sm:px-10 lg:px-12">
        <Link href="/" aria-label="TineSight home" className="inline-flex min-h-11 items-center text-lg font-semibold tracking-[0.3em] sm:text-xl">
          TINE<span className="text-brass">SIGHT</span>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-8">
          <a href="#the-record" className="hidden min-h-11 items-center text-sm text-weathered transition-colors hover:text-parchment sm:inline-flex">How it works</a>
          <Link href="/login" className="inline-flex min-h-11 items-center gap-3 text-sm text-parchment transition-colors hover:text-brass-light">
            Sign in <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </nav>
      </header>
      <main>
        <section className="mx-auto grid max-w-[1280px] items-center gap-12 px-6 pb-16 pt-8 sm:px-10 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:px-12 lg:pb-20 lg:pt-10">
          <div className="lg:py-10">
            <p className="mb-7 flex items-center gap-4 text-[11px] font-medium uppercase tracking-[0.24em] text-brass-light">
              <span className="h-px w-8 bg-brass/60" aria-hidden="true" />A field record. A familiar face.
            </p>
            <h1 className="max-w-xl font-display text-[clamp(2.75rem,5.2vw,4.5rem)] font-medium leading-[1.06] tracking-[-0.035em]">
              Know the buck.<br /><span className="text-brass-light italic">Follow the story.</span>
            </h1>
            <p className="mt-7 max-w-[410px] text-base leading-[1.8] text-weathered sm:text-[17px]">
              Turn a season of trail-camera photos into a collection you know by name. TineSight helps identify the same buck, connect his sightings, and keep his story in one place.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3">
              <Link href="/signup" className="inline-flex min-h-12 items-center justify-center gap-5 rounded-md border border-brass/70 px-6 py-3.5 text-sm font-medium text-brass-light transition-colors hover:border-brass-light hover:bg-brass/10">
                Start your collection <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a href="#the-record" className="inline-flex min-h-11 items-center gap-2 text-sm text-weathered transition-colors hover:text-parchment">
                Take a closer look <ArrowDown className="size-3.5" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-12 border-t border-forest-light pt-5 text-[10px] uppercase tracking-[0.2em] text-weathered sm:text-[11px]">
              Every photo <span className="px-2 text-brass/70">/</span> Every camera <span className="px-2 text-brass/70">/</span> All season
            </p>
          </div>
          <figure className="min-w-0">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-brass/25 bg-forest">
              <Image src="/landing/kyle-underwood.webp" alt="Whitetail buck with tall antlers against a muted woodland background" fill priority sizes="(min-width: 1280px) 552px, (min-width: 1024px) 46vw, 100vw" className="object-cover object-top" />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-deep-forest/90 to-transparent" aria-hidden="true" />
              <div className="absolute inset-x-6 bottom-6 sm:inset-x-8 sm:bottom-8">
                <p className="mb-2 text-[10px] uppercase tracking-[0.24em] text-parchment/80">The season is in the details</p>
                <p className="font-display text-3xl italic sm:text-4xl">Every buck has a story.</p>
              </div>
            </div>
            <figcaption className="mt-3 text-[10px] text-weathered">
              Photo by{' '}
              <a href="https://tamron-americas.com/photo-tip/reigniting-a-passion-for-the-outdoors/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline decoration-brass/40 underline-offset-4 hover:text-brass-light">Kyle Underwood</a>
            </figcaption>
          </figure>
        </section>
        <section id="the-record" aria-labelledby="record-heading" className="scroll-mt-8 border-y border-forest-light bg-forest/25">
          <div className="mx-auto grid max-w-[1280px] gap-10 px-6 py-16 sm:px-10 lg:grid-cols-[1fr_1.3fr] lg:gap-20 lg:px-12 lg:py-20">
            <div>
              <p className="mb-5 text-[11px] uppercase tracking-[0.24em] text-brass-light">From camera roll to collection</p>
              <h2 id="record-heading" className="font-display text-4xl font-medium leading-tight tracking-tight">The same buck.<br />One growing record.</h2>
              <p className="mt-5 max-w-sm text-sm leading-7 text-weathered">Upload your photos. Review suggested matches. Give a buck a name, and bring his sightings together in a catalog that grows with the season.</p>
              <Link href="/signup" className="mt-5 inline-flex min-h-11 items-center gap-3 text-sm text-brass-light hover:text-parchment">Build your catalog <ArrowRight className="size-4" aria-hidden="true" /></Link>
            </div>
            <figure>
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {SIGHTINGS.map((sighting) => (
                  <div key={sighting.time}>
                    <div className="relative aspect-square overflow-hidden rounded-lg border border-forest-light bg-deep-forest">
                      <Image src={sighting.src} alt={`Trail-camera sighting of Split at ${sighting.time}`} fill sizes="(min-width: 1024px) 180px, 30vw" className="object-contain" />
                    </div>
                    <p className="mt-3 font-mono text-[10px] text-weathered sm:text-xs">{sighting.time}</p>
                  </div>
                ))}
              </div>
              <figcaption className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-brass/40 pt-5">
                <div><span className="mr-3 font-display text-3xl italic">Split</span><span className="text-xs text-weathered">Three moments. One familiar buck.</span></div>
                <span className="font-mono text-[10px] tracking-wider text-weathered">SEP 28 · SIGHTING EXAMPLE</span>
              </figcaption>
            </figure>
          </div>
        </section>
        <section aria-labelledby="features-heading" className="mx-auto grid max-w-[1280px] gap-12 px-6 py-16 sm:px-10 lg:grid-cols-[1fr_1.3fr] lg:gap-20 lg:px-12 lg:py-24">
          <div>
            <p className="mb-5 text-[11px] uppercase tracking-[0.24em] text-brass-light">Made for the whole season</p>
            <h2 id="features-heading" className="max-w-sm font-display text-4xl font-medium leading-tight tracking-tight sm:text-5xl">More than a folder<br />full of photos.</h2>
            <p className="mt-6 max-w-sm text-sm leading-7 text-weathered">From the first camera pull to the collection you share, keep the photos, the identities, and the history together.</p>
          </div>
          <ol className="border-t border-forest-light">
            {FEATURES.map((feature) => (
              <li key={feature.number} className="grid grid-cols-[2rem_1fr] gap-4 border-b border-forest-light py-8 sm:grid-cols-[3rem_1fr] sm:gap-5 sm:py-9">
                <span className="pt-0.5 font-mono text-xs text-brass-light" aria-hidden="true">{feature.number}</span>
                <div>
                  <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-weathered">{feature.label}</p>
                  <h3 className="font-display text-2xl font-medium leading-tight sm:text-3xl">{feature.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-weathered">{feature.description}</p>
                  <p className="mt-5 text-xs leading-6 text-parchment/80">{feature.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="start-heading" className="border-y border-forest-light bg-forest/25">
          <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-8 px-6 py-14 sm:px-10 lg:flex-row lg:items-center lg:gap-16 lg:px-12 lg:py-16">
            <div>
              <p className="mb-4 text-[11px] uppercase tracking-[0.24em] text-brass-light">Your next camera pull is a beginning</p>
              <h2 id="start-heading" className="font-display text-4xl font-medium leading-tight tracking-tight">Start with a photo.<br /><span className="italic">Build something worth keeping.</span></h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-weathered">Upload your first photos, get to know your bucks, and make this season easier to look back on.</p>
            </div>
            <Link href="/signup" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-5 rounded-md border border-brass/70 px-6 py-3.5 text-sm font-medium text-brass-light transition-colors hover:border-brass-light hover:bg-brass/10">
              Start your collection <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-6 py-7 text-xs text-weathered sm:px-10 lg:px-12">
        <p>TineSight <span className="mx-2 text-brass/60">/</span> Your season, well kept.</p>
        <Link href="/login" className="inline-flex min-h-11 items-center hover:text-parchment">Back to your collection <ArrowRight className="ml-3 size-3.5" aria-hidden="true" /></Link>
      </footer>
    </div>
  )
}
