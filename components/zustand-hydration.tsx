'use client'

import { useEffect } from 'react'
import { useUIStore } from '@/lib/stores/ui'

export function ZustandHydration() {
  useEffect(() => {
    // Trigger hydration after initial render is complete
    // This runs after React has committed the initial DOM,
    // preventing the hydration cascade that crashes iOS Safari
    useUIStore.persist.rehydrate()
  }, [])

  return null
}
