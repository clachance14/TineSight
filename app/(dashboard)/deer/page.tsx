import { PageHeading } from '@/components/layout/page-heading'
import { Suspense } from 'react'
import { DeerCatalogClient } from './deer-catalog-client'

export const metadata = {
  title: 'Deer Catalog | TineSight',
  description: 'Your trophy buck catalog',
}

export default function DeerPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeading eyebrow="Your collection" title="The Trophy Room" description="Every identified buck, with his photos and the history behind his name." />
      <Suspense fallback={<div className="text-sm text-cream-dark">Loading the catalog…</div>}>
        <DeerCatalogClient />
      </Suspense>
    </div>
  )
}
