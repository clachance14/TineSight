import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound(): React.JSX.Element {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-deep-forest px-6 py-16 text-center text-parchment">
      <Link
        href="/"
        className="mb-12 inline-flex min-h-11 items-center font-display text-2xl tracking-[0.14em] text-brass"
      >
        TINESIGHT
      </Link>
      <p className="font-mono text-xs uppercase tracking-widest text-weathered">
        Page unavailable
      </p>
      <h1 className="mt-4 font-display text-4xl sm:text-5xl">
        This trail ends here.
      </h1>
      <p className="mt-5 max-w-md text-sm leading-7 text-weathered">
        The page may have moved, or this shared link may no longer be available.
      </p>
      <Button asChild className="mt-8 min-h-12">
        <Link href="/">Back to TineSight</Link>
      </Button>
    </main>
  )
}
