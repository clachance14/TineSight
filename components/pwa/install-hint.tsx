'use client'

import { useEffect, useState } from 'react'
import { shouldShowInstallHint } from '@/lib/pwa/install-detection'

const DISMISS_KEY = 'tinesight:pwa-install-hint-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // Safari private mode throws on localStorage access — treat as not dismissed.
    return false
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Ignore — non-persistent dismissal is acceptable.
  }
}

export function InstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean }
    setShow(
      shouldShowInstallHint({
        userAgent: nav.userAgent,
        platform: nav.platform,
        maxTouchPoints: nav.maxTouchPoints,
        matchStandalone: window.matchMedia('(display-mode: standalone)').matches,
        navigatorStandalone: nav.standalone,
        dismissed: readDismissed(),
      }),
    )
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl border border-brass/30 bg-forest/95 px-4 py-3 text-sm text-parchment shadow-lg backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <span className="flex-1 leading-snug">
        Install TineSight: tap{' '}
        <span className="font-semibold text-brass-light">Share</span>, then{' '}
        <span className="font-semibold text-brass-light">Add to Home Screen</span>.
      </span>
      <button
        type="button"
        aria-label="Dismiss install hint"
        onClick={() => {
          writeDismissed()
          setShow(false)
        }}
        className="-mr-1 shrink-0 rounded-md px-2 py-1 text-parchment/70 hover:text-parchment"
      >
        ✕
      </button>
    </div>
  )
}
