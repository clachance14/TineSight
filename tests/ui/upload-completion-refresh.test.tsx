/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useActiveProcessingBatch, setActiveUploadSessionId } from '@/lib/hooks/use-active-batch'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import { useUploadStore } from '@/lib/stores/upload'

function Gallery() {
  useActiveProcessingBatch()
  // The page and its status bar both subscribe to the same session.
  useActiveProcessingBatch()
  const { data } = usePhotosInfinite({ uploadSessionId: 'finished-session' })
  return <p>{data?.pages[0]?.photos[0]?.detection_status === 'completed' ? 'Analysis complete' : 'Still processing'}</p>
}
afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals() })
it('refreshes stale gallery tiles as soon as session stats report completion', async () => {
  useUploadStore.getState().reset()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const photo = { id: 'photo', detection_status: 'processing', variant_status: 'ready' }
  client.setQueryData(['photos', 'infinite', { uploadSessionId: 'finished-session' }], { pages: [{ photos: [photo], total: 1, nextCursor: null }], pageParams: [null] })
  setActiveUploadSessionId('finished-session')
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.startsWith('/api/photos/stats')
    ? { total_photos: 1, analyzed_photos: 1, pending_photos: 0, processing_photos: 0, failed_photos: 0 }
    : { photos: [{ ...photo, detection_status: 'completed' }], total: 1, nextCursor: null }))))
  try {
    render(<QueryClientProvider client={client}><Gallery /></QueryClientProvider>)
    expect(screen.getByText('Still processing')).toBeInTheDocument()
    expect(await screen.findByText('Analysis complete', {}, { timeout: 1000 })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  } finally { client.clear() }
})
