import { beforeEach, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PhotoTriageToolbar } from '@/components/photos/photo-triage-toolbar'
import { usePhotoSelectionStore } from '@/lib/stores/photo-selection'

beforeEach(() => usePhotoSelectionStore.getState().exitSelectMode())

async function select(ids: string[]) {
  const user = userEvent.setup()
  render(<QueryClientProvider client={new QueryClient()}><PhotoTriageToolbar filters={{ triageView: 'all' }} visibleIds={ids} total={ids.length} /></QueryClientProvider>)
  await user.click(screen.getByRole('button', { name: 'Select photos' }))
  expect(screen.getByRole('button', { name: 'Download selected' })).toBeDisabled()
  act(() => usePhotoSelectionStore.getState().selectAll(ids))
  await user.click(screen.getByRole('button', { name: 'Download selected' }))
  return user
}

it('downloads only the selected original photo with the server filename', async () => {
  const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ downloadUrl: 'https://storage.example/photo', filename: 'deer.jpg' }))
  const downloads: string[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download) })
  const user = await select(['photo-one'])
  expect(screen.getByText('Download the original photo to your computer.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Download photo' }))
  await waitFor(() => expect(downloads).toEqual(['deer.jpg']))
  expect(JSON.parse(request.mock.calls[0]![1]!.body as string)).toEqual({ photoIds: ['photo-one'] })
})

it('downloads a ZIP of the selection captured when the dialog opened', async () => {
  const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('zip', { headers: { 'Content-Type': 'application/zip' } }))
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test-download') })
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const user = await select(['photo-one', 'photo-two'])
  act(() => usePhotoSelectionStore.getState().selectAll(['different-photo']))
  await user.click(screen.getByRole('button', { name: 'Download ZIP' }))
  await waitFor(() => expect(download).toHaveBeenCalledOnce())
  expect(JSON.parse(request.mock.calls[0]![1]!.body as string)).toEqual({ photoIds: ['photo-one', 'photo-two'] })
})

it('shows a failed download with a retry action', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: 'Photo unavailable' }, { status: 404 }))
  const user = await select(['photo-one'])
  await user.click(screen.getByRole('button', { name: 'Download photo' }))
  expect(await screen.findByText('Photo unavailable')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Retry Export' })).toBeEnabled()
})
