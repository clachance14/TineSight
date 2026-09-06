'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageState } from '@/components/layout/page-state'

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): React.JSX.Element {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <PageState
        error
        title="We couldn’t open this page."
        description="Try again to reconnect. You can also return to your overview and pick up from there."
      >
        <div className="flex flex-wrap gap-3">
          <Button onClick={reset} className="min-h-12">
            Try again
          </Button>
          <Button asChild variant="outline" className="min-h-12">
            <Link href="/dashboard">Go to overview</Link>
          </Button>
        </div>
      </PageState>
    </div>
  )
}
