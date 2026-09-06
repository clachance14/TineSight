import Link from 'next/link'
import { ArrowRight, Upload, Images, MapPin, Crosshair } from 'lucide-react'
import { PageHeading } from '@/components/layout/page-heading'

const destinations = [
  {
    href: '/photos',
    title: 'Your photo library',
    description:
      'Review camera pulls, filter your photos, and find the sightings worth a closer look.',
    icon: Images,
  },
  {
    href: '/deer',
    title: 'The trophy room',
    description:
      'Come back to the bucks you know and follow their sighting histories.',
    icon: Crosshair,
  },
  {
    href: '/locations',
    title: 'Places on your property',
    description:
      'Map camera spots, keep field notes, and browse photos by location.',
    icon: MapPin,
  },
]

export default function DashboardPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeading
        eyebrow="Your field record"
        title="Back to the season."
        description="Your photos, familiar bucks, and favorite camera spots—all in one place."
      />
      <section className="mb-10 flex flex-col items-start justify-between gap-6 rounded-xl border border-brass/30 bg-forest/30 p-6 sm:p-9 lg:flex-row lg:items-center">
        <div>
          <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-brass-light">
            The next chapter
          </p>
          <h2 className="font-display text-3xl text-parchment">
            Start with your latest camera pull.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-weathered">
            Add your photos, give them a location, and let TineSight help you
            find the animals in them.
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex min-h-12 shrink-0 items-center gap-3 rounded-md border border-brass/60 px-5 text-sm text-brass-light hover:bg-brass/10"
        >
          <Upload className="size-4" aria-hidden="true" />
          Upload photos
        </Link>
      </section>
      <nav
        aria-label="Explore your collection"
        className="divide-y divide-forest-light border-y border-forest-light"
      >
        {destinations.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-start gap-5 py-7 sm:gap-7"
          >
            <item.icon
              className="mt-1 size-5 shrink-0 text-brass"
              aria-hidden="true"
            />
            <div className="flex-1">
              <h2 className="font-display text-2xl text-parchment group-hover:text-brass-light">
                {item.title}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-weathered">
                {item.description}
              </p>
            </div>
            <ArrowRight
              className="mt-2 size-4 text-weathered group-hover:text-brass"
              aria-hidden="true"
            />
          </Link>
        ))}
      </nav>
    </div>
  )
}
