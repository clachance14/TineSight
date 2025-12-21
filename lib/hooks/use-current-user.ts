'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Hook to get the current authenticated user ID
 * Encapsulates Supabase auth logic per service layer guidelines
 */
export function useCurrentUser() {
  const [userId, setUserId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user !== null) {
        setUserId(user.id)
      }
      setIsLoading(false)
    })
  }, [])

  return { userId, isLoading }
}
