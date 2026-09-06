import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PhotoGrid } from '@/components/photos/photo-grid'

vi.mock('@/lib/hooks/use-photos', () => ({ usePhotosInfinite: () => ({}) }))
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: () => ({ measure: () => {}, getVirtualItems: () => [{ index: 0, key: 0, start: 0 }], getTotalSize: () => 180 }) }))
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })

const empty = { photos: [], total: 0, isLoading: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: () => {} }

it('shows a bounded skeleton grid with spinners until the first photo arrives', () => {
  const { container, rerender } = render(<PhotoGrid externalData={empty} waitingForUpload pendingPhotoCount={1000} />)
  expect(screen.getByRole('status')).toHaveTextContent('Preparing your photos')
  expect(container.querySelectorAll('[data-photo-skeleton]')).toHaveLength(12)
  expect(container.querySelectorAll('[data-photo-skeleton] .animate-spin')).toHaveLength(12)
  expect(screen.queryByText('No photos in this view.')).not.toBeInTheDocument()
  rerender(<PhotoGrid waitingForUpload externalData={{ ...empty, total: 1, photos: [{ id: 'first-photo', original_filename: 'deer.jpg', thumbnailUrl: null, detection_status: 'processing', bestQualityStatus: null }] }} />)
  expect(container.querySelector('[data-photo-skeleton]')).not.toBeInTheDocument()
  expect(container.querySelector('[data-photo-grid]')).toBeInTheDocument()
})

it('keeps a single-photo upload to one skeleton and restores the empty state after work ends', () => {
  const { container, rerender } = render(<PhotoGrid externalData={empty} waitingForUpload pendingPhotoCount={1} />)
  expect(container.querySelectorAll('[data-photo-skeleton]')).toHaveLength(1)
  rerender(<PhotoGrid externalData={empty} waitingForUpload={false} />)
  expect(screen.getByText('No photos in this view.')).toBeInTheDocument()
})

it('shows a fetch failure rather than an indefinite processing spinner', () => {
  render(<PhotoGrid externalData={{ ...empty, error: new Error('Connection lost') }} waitingForUpload />)
  expect(screen.getByText('Connection lost')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  expect(screen.queryByText(/Preparing your photos/)).not.toBeInTheDocument()
})
