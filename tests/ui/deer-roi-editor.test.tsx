import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DetectionROIEditor } from '@/components/photos/detection-roi-editor'

vi.mock('@/components/photos/roi-selector', () => ({ ROISelector: ({ onROIChange }: { onROIChange: (roi: { x: number; y: number; width: number; height: number }) => void }) => <button onClick={() => onROIChange({ x: 1000, y: 2000, width: 3000, height: 4000 })}>Draw ROI</button> }))

it('saves the selected ROI for the deer and returns to its details', async () => {
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ roi: null }))
  const onBack = vi.fn()
  const user = userEvent.setup()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <DetectionROIEditor detection={{ id: 'selected-deer', imageUrl: '/photo.jpg', bboxX: 0.1, bboxY: 0.2, bboxWidth: 0.3, bboxHeight: 0.4 }} onBack={onBack} />
  </QueryClientProvider>)
  fireEvent.load(await screen.findByRole('img'))
  expect(screen.getByRole('button', { name: 'Save ROI' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Draw ROI' }))
  await user.click(screen.getByRole('button', { name: 'Save ROI' }))
  await waitFor(() => expect(onBack).toHaveBeenCalledOnce())
  expect(request).toHaveBeenCalledWith('/api/detections/selected-deer/roi', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ roi_x: 1000, roi_y: 2000, roi_width: 3000, roi_height: 4000 }),
  }))
})
