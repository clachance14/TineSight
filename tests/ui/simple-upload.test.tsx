/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UploadPage from '@/app/(dashboard)/upload/page'
import { useUploadStore } from '@/lib/stores/upload'

const navigation = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => navigation }))
vi.mock('@/components/upload/BulkUploader', () => ({ BulkUploader: ({ onUploadStarted }: { onUploadStarted: (id: string) => void }) => <button onClick={() => onUploadStarted('upload-session')}>Upload confirmed</button> }))
vi.mock('@/components/photos/photo-uploader', () => ({ PhotoUploader: ({ onFilesReady }: { onFilesReady: () => void }) => <button onClick={onFilesReady}>Select test photos</button> }))
vi.mock('@/components/photos/upload-progress-panel', () => ({ UploadProgressPanel: () => null }))
vi.mock('@/lib/hooks/use-locations', () => ({ useLocations: () => ({ data: { locations: [{ id: 'saved-north', name: 'North Pasture', lat: 44, lng: -89, direction_compass: 0 }] } }), useCreateLocation: () => ({ isPending: false }) }))
vi.mock('@/lib/hooks/use-adaptive-throttle', () => ({ useAdaptiveThrottle: () => ({}) }))
vi.mock('@/lib/hooks/use-active-batch', () => ({ setActiveUploadSessionId: vi.fn() }))
vi.mock('@/lib/upload', () => ({}))
beforeEach(() => { useUploadStore.getState().reset(); navigation.push.mockClear() })
async function setup() {
  const user = userEvent.setup()
  render(<QueryClientProvider client={new QueryClient()}><UploadPage /></QueryClientProvider>)
  await user.click(screen.getByRole('tab', { name: 'Choose photos' }))
  await user.click(screen.getByRole('button', { name: 'Select test photos' }))
  return user
}
describe('simple uploader location integration', () => {
  it('opens all photos from the upload session once when the bulk uploader starts', async () => {
    const user = userEvent.setup()
    render(<QueryClientProvider client={new QueryClient()}><UploadPage /></QueryClientProvider>)
    expect(navigation.push).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Upload confirmed' }))
    expect(navigation.push).toHaveBeenCalledWith('/photos?uploadSessionId=upload-session&triageView=all')
    await user.click(screen.getByRole('button', { name: 'Upload confirmed' }))
    expect(navigation.push).toHaveBeenCalledTimes(1)
  })
  it('retains the location ID and north direction in the upload store', async () => {
    const user = await setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Saved location' }), 'saved-north')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(useUploadStore.getState().pendingLocation).toMatchObject({ locationId: 'saved-north', areaName: 'North Pasture', lat: 44, lng: -89, directionCompass: 0 })
    expect(screen.getByText('North Pasture')).toBeInTheDocument()
    expect(useUploadStore.getState().isUploading).toBe(false)
  })
  it('preserves the previous group location when a change is dismissed', async () => {
    useUploadStore.getState().setPendingLocation({ locationId: 'previous', areaName: 'Creek', lat: 1, lng: 2 })
    const user = await setup()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(useUploadStore.getState().pendingLocation?.locationId).toBe('previous')
    expect(useUploadStore.getState().showLocationPicker).toBe(false)
  })
  it('clears the group location only on explicit skip', async () => {
    useUploadStore.getState().setPendingLocation({ locationId: 'previous', areaName: 'Creek', lat: 1, lng: 2 })
    const user = await setup()
    await user.click(screen.getByRole('button', { name: 'Skip location' }))
    expect(useUploadStore.getState().pendingLocation).toBeNull()
    expect(useUploadStore.getState().isUploading).toBe(false)
  })
})
