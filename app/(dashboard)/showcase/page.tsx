import { PageHeading } from '@/components/layout/page-heading'
import type { Metadata } from 'next'
import { ShowcaseManager } from '@/components/showcase/showcase-manager'

export const metadata: Metadata = {
  title: 'Showcase - TineSight',
}

export default function ShowcasePage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeading eyebrow="Share the season" title="Showcase" description="Choose the bucks you want to feature and share a closer look at your property." />
      <ShowcaseManager />
    </div>
  )
}
