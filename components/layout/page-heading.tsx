import type { ReactNode } from 'react'

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <header className="mb-8 flex flex-col items-start justify-between gap-5 border-b border-forest-light/70 pb-6 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-brass-light">
          {eyebrow}
        </p>
        <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-parchment sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-weathered">
          {description}
        </p>
      </div>
      {actions !== undefined && (
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {actions}
        </div>
      )}
    </header>
  )
}
