import type { ReactNode } from 'react'

export function PageState({
  title,
  description,
  children,
  error = false,
}: {
  title: string
  description: string
  children?: ReactNode
  error?: boolean
}): React.JSX.Element {
  return (
    <div
      role={error ? 'alert' : 'status'}
      className="rounded-xl border border-forest-light bg-forest/20 px-6 py-10 sm:px-9 sm:py-14"
    >
      <span
        className={`mb-6 block h-px w-10 ${error ? 'bg-destructive/60' : 'bg-brass/60'}`}
        aria-hidden="true"
      />
      <h2 className="font-display text-2xl font-medium text-parchment sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-md text-sm leading-7 text-weathered">
        {description}
      </p>
      {children !== undefined && (
        <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>
      )}
    </div>
  )
}
