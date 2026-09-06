'use client'

import '@/lib/suppress-warnings' // Suppress known TanStack Virtual React 19 warning
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query-client'
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createAccountBoundary, authNavigation } from '@/lib/auth/account-boundary'
import { usePhotoSelectionStore } from '@/lib/stores/photo-selection'
import { useUploadStore } from '@/lib/stores/upload'
import { useDetectionEdit } from '@/lib/stores/detection-edit'
import { useBatchSelectionStore } from '@/lib/stores/batch-selection'
import { useDetectionHover } from '@/lib/stores/detection-hover'

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const queryClient = getQueryClient()
  const [changingAccount, setChangingAccount] = useState(false)
  const pathname = usePathname()
  const isAuthForm = pathname === '/signup' || pathname === '/login'
  const isPublicPage = pathname === '/' || /^\/showcase\/[^/]+$/.test(pathname) || isAuthForm || pathname === '/forgot-password' || pathname === '/reset-password'

  useEffect(() => {
    const boundary = createAccountBoundary(queryClient, () => {
      usePhotoSelectionStore.getState().exitSelectMode()
      useUploadStore.getState().reset()
      useDetectionEdit.getState().closePanel()
      useBatchSelectionStore.getState().clearSelection()
      useDetectionHover.getState().setHoveredDetectionId(null)
      useDetectionHover.getState().setPinnedDetectionId(null)
      try {
        sessionStorage.removeItem('tinesight:active_upload_session_id')
        sessionStorage.removeItem('tinesight:active_batch_id')
      } catch { /* Storage can be disabled by browser privacy settings. */ }
    }, (accountId) => {
      // Auth forms finish profile creation before navigating. Reloading here
      // aborts that request; private account switches still require teardown.
      const navigation = authNavigation(accountId, isAuthForm, isPublicPage)
      if (navigation === 'form') return
      // Cache clearing alone leaves mounted observers and server-rendered props alive.
      flushSync(() => setChangingAccount(true))
      if (navigation === 'reload') window.location.reload()
      else window.location.assign('/login')
    })
    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event, session) => {
      boundary(session?.user.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [queryClient, isAuthForm, isPublicPage])

  return (
    <QueryClientProvider client={queryClient}>
      {!changingAccount && children}
    </QueryClientProvider>
  )
}
