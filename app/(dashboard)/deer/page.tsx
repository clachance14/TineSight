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
        <h1 className="text-2xl font-bold text-cream">Deer Catalog</h1>
        <p className="text-sm text-cream-dark mt-1">
          Your named deer profiles and sighting history
        </p>
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <DeerCatalogClient />
      </Suspense>
    </div>
  )
}
