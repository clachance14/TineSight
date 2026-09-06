import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { SignupForm } from '@/components/auth/signup-form'

export default function SignupPage(): React.JSX.Element {
  return (
    <main className="grid min-h-svh bg-deep-forest text-parchment lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative m-4 hidden overflow-hidden rounded-xl border border-brass/20 bg-forest lg:block">
        <Image src="/landing/kyle-underwood.webp" alt="Whitetail buck photographed by Kyle Underwood" fill sizes="50vw" className="object-cover object-top" />
        <div className="absolute inset-0 bg-gradient-to-t from-deep-forest via-transparent to-deep-forest/30" aria-hidden="true" />
        <Link href="/" aria-label="TineSight home" className="absolute left-9 top-7 inline-flex min-h-11 items-center text-sm font-semibold tracking-[0.3em]">TINE<span className="text-brass-light">SIGHT</span></Link>
        <div className="absolute inset-x-9 bottom-9 xl:inset-x-12 xl:bottom-12">
          <p className="mb-4 text-[10px] uppercase tracking-[0.25em] text-brass-light">Your season, well kept.</p>
          <h2 className="max-w-md font-display text-[clamp(2.5rem,3.6vw,3.75rem)] font-medium leading-[1.1] tracking-tight">A familiar face.<br /><span className="italic">A story worth following.</span></h2>
          <p className="mt-5 max-w-sm text-sm leading-7 text-parchment/75">Every camera. Every sighting. A collection that gets richer with every season.</p>
        </div>
      </aside>
      <div className="flex min-h-svh flex-col px-6 sm:px-12 lg:px-14">
        <header className="flex items-center justify-between gap-4 py-6 lg:justify-end">
          <Link href="/" aria-label="TineSight home" className="inline-flex min-h-11 items-center text-xs font-semibold tracking-[0.25em] lg:hidden">TINE<span className="text-brass">SIGHT</span></Link>
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-xs text-weathered transition-colors hover:text-parchment"><ArrowLeft className="size-3.5" aria-hidden="true" /> Back to home</Link>
        </header>
        <div className="mx-auto flex w-full max-w-[384px] flex-1 flex-col justify-center py-6 sm:py-8">
          <p className="mb-5 text-[10px] uppercase tracking-[0.25em] text-brass-light">Your season starts here</p>
          <h1 className="font-display text-4xl font-medium leading-tight tracking-tight sm:text-5xl">Make it your season.</h1>
          <p className="mb-7 mt-4 text-sm leading-7 text-weathered">Create an account to organize your photos and start getting to know your bucks.</p>
          <SignupForm />
        </div>
        <footer className="pb-7 pt-6 text-center text-[10px] uppercase tracking-[0.2em] text-weathered">Every photo. Every camera. All season.</footer>
      </div>
    </main>
  )
}
