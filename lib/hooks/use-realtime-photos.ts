'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PhotoStatusUpdate } from '@/lib/supabase/realtime'
import { extractPhotoStatus } from '@/lib/supabase/realtime'
import type { RealtimeChannel, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type ImageRow = Database['public']['Tables']['images']['Row']

interface UseRealtimePhotosOptions {
  userId: string
  enabled?: boolean
  onStatusChange?: (update: PhotoStatusUpdate) => void
}

interface UseRealtimePhotosReturn {
  isConnected: boolean
  lastUpdate: Date | null
  error: Error | null
}

interface PhotosInfiniteData {
  pages: Array<{
    photos: Array<{
      id: string
      [key: string]: unknown
    }>
    [key: string]: unknown
  }>
  pageParams: unknown[]
}

interface PhotosData {
  photos: Array<{
    id: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

interface PhotoDetailData {
  photo: {
    id: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Hook to subscribe to realtime photo status updates via Supabase
 * Updates TanStack Query cache when photos are updated
 */
export function useRealtimePhotos({
  userId,
  enabled = true,
  onStatusChange,
}: UseRealtimePhotosOptions): UseRealtimePhotosReturn {
  const queryClient = useQueryClient()

  // Use state for return values to trigger re-renders
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!enabled || userId.length === 0) {
      return
    }

    const supabase = createClient()

    // Create channel for this user's photo updates
    const channel = supabase
      .channel(`photo-status:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'images',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<ImageRow>) => {
          // Extract photo status from payload
          const update = extractPhotoStatus(payload)

          if (update === null) {
            return
          }

          // Track last update time
          setLastUpdate(new Date())

          // Notify callback if provided
          if (onStatusChange) {
            onStatusChange(update)
          }

          // Update TanStack Query cache for infinite scroll queries
          queryClient.setQueriesData<PhotosInfiniteData>(
            { queryKey: ['photos', 'infinite'], exact: false },
            (oldData) => {
              if (oldData?.pages === undefined) return oldData

              return {
                ...oldData,
                pages: oldData.pages.map((page) => ({
                  ...page,
                  photos: page.photos.map((photo) =>
                    photo.id === update.id
                      ? { ...photo, ...update }
                      : photo
                  ),
                })),
              }
            }
          )

          // Update TanStack Query cache for non-infinite queries
          queryClient.setQueriesData<PhotosData>(
            { queryKey: ['photos'], exact: false },
            (oldData) => {
              if (oldData?.photos === undefined) return oldData

              return {
                ...oldData,
                photos: oldData.photos.map((photo) =>
                  photo.id === update.id
                    ? { ...photo, ...update }
                    : photo
                ),
              }
            }
          )

          // Update TanStack Query cache for photo detail view
          queryClient.setQueriesData<PhotoDetailData>(
            { queryKey: ['photo', update.id], exact: true },
            (oldData) => {
              if (oldData?.photo === undefined) return oldData

              return {
                ...oldData,
                photo: {
                  ...oldData.photo,
                  ...update,
                },
              }
            }
          )
        }
      )
      .subscribe((status: REALTIME_SUBSCRIBE_STATES, err?: Error) => {
        // Handle subscription status changes
        switch (status) {
          case 'SUBSCRIBED':
            setIsConnected(true)
            setError(null)
            break

          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
            setIsConnected(false)
            setError(err ?? new Error(`Subscription ${status.toLowerCase()}`))
            break

          case 'CLOSED':
            setIsConnected(false)
            break
        }
      })

    channelRef.current = channel

    // Cleanup on unmount
    return () => {
      if (channelRef.current !== null) {
        void supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      setIsConnected(false)
      setLastUpdate(null)
      setError(null)
    }
  }, [userId, enabled, onStatusChange, queryClient])

  return {
    isConnected,
    lastUpdate,
    error,
  }
}
