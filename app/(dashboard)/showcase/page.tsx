import type { Metadata } from 'next'
import { ShowcaseManager } from '@/components/showcase/showcase-manager'

export const metadata: Metadata = {
  title: 'Showcase - TineSight',
}

export default function ShowcasePage(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col space-y-4 overflow-y-auto">
      <div>
        <h1 className="text-xl font-bold text-cream">Showcase</h1>
        <p className="text-sm text-cream-dark">
          Curate trophy bucks into a public link you can share with prospective lessees.
        </p>
      </div>
      <ShowcaseManager />
    </div>
  )
}
