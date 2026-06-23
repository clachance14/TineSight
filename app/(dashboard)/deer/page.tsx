import { Suspense } from 'react'
import { DeerCatalogClient } from './deer-catalog-client'

export const metadata = {
  title: 'Deer Catalog | TineSight',
  description: 'Your trophy buck catalog',
}

export default function DeerPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-cream">The Trophy Room</h1>
        <p className="mt-1 text-sm text-cream-dark">
          Your catalog of identified bucks, ranked by Score
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-cream-dark">Loading the catalog…</div>}>
        <DeerCatalogClient />
      </Suspense>
    </div>
  )
}
