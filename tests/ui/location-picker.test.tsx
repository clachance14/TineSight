/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LocationPickerModal } from '@/components/photos/location-picker-modal'
import type { LocationWithPhotoCount } from '@/lib/services/locations'

vi.hoisted(() => { process.env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'] = 'test-map-key' })
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMap: () => null,
  Map: ({ children, onClick }: { children: React.ReactNode; onClick: (event: { detail: { latLng: { lat: number; lng: number } } }) => void }) => <div role="region" aria-label="Location map"><button onClick={() => onClick({ detail: { latLng: { lat: 43, lng: -90 } } })}>Choose map point</button>{children}</div>,
  AdvancedMarker: ({ title, onClick }: { title?: string; onClick?: () => void }) => title !== undefined ? <button onClick={onClick}>{title}</button> : <span>New location pin</span>,
}))

const location = { id: 'north', name: 'North Pasture', lat: 44, lng: -89, direction_compass: 0, direction_notes: 'Trail', photo_count: 12 } as LocationWithPhotoCount
function setup(props = {}) {
  const onConfirm = vi.fn(), onSkip = vi.fn(), onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><LocationPickerModal isOpen existingLocations={[location]} photoCount={3} onConfirm={onConfirm} onSkip={onSkip} onClose={onClose} {...props} /></QueryClientProvider>)
  return { onConfirm, onSkip, onClose, user: userEvent.setup() }
}
async function newLocation(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole('combobox'), 'new')
  fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '0' } })
  await user.type(screen.getByLabelText('Location name'), '  Creek Bottom  ')
}
beforeEach(() => { vi.unstubAllGlobals(); vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', '') })
describe('location step', () => {
  it('shows the group count and requires a choice', () => {
    setup()
    expect(screen.getByText(/3 photos in this group/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })
  it.each(['Back', 'Close'])('%s dismisses without skipping or uploading', async name => {
    const { user, onClose, onSkip, onConfirm } = setup()
    await user.click(screen.getByRole('button', { name }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSkip).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
  it('Escape dismisses without skipping', async () => {
    const { user, onClose, onSkip } = setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSkip).not.toHaveBeenCalled()
  })
  it('skips only with an explicit action', async () => {
    const { user, onSkip, onConfirm } = setup()
    await user.click(screen.getByRole('button', { name: 'Skip location' }))
    expect(onSkip).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })
  it('preserves the saved location ID, coordinates and north direction', async () => {
    const { user, onConfirm } = setup()
    await user.selectOptions(screen.getByRole('combobox'), 'north')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledWith({ locationId: 'north', areaName: 'North Pasture', lat: 44, lng: -89, directionCompass: 0, directionNotes: 'Trail' })
  })
  it('creates a location through the API before confirming, including zero coordinates', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ location: { ...location, id: 'creek', name: 'Creek Bottom', lat: 0, lng: 0 } }) })
    vi.stubGlobal('fetch', fetch)
    const { user, onConfirm } = setup({ existingLocations: [] })
    await newLocation(user)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'creek', lat: 0, lng: 0 })))
    expect(fetch).toHaveBeenCalledWith('/api/locations', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Creek Bottom', lat: 0, lng: 0 }) }))
  })
  it.each([['91', '0'], ['0', '-181'], ['', '0'], ['0', '']])('rejects coordinates %s, %s', async (lat, lng) => {
    const { user } = setup()
    await newLocation(user)
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: lat } })
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: lng } })
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })
  it('keeps the draft and allows retry after a failed save', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Location already exists' }) }))
    const { user, onConfirm } = setup()
    await newLocation(user)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Location already exists')
    expect(screen.getByLabelText('Location name')).toHaveValue('  Creek Bottom  ')
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  })
  it('locks navigation and duplicate submissions while saving', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const { user, onClose } = setup()
    await newLocation(user)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })
  it('shows loading and recovery states', async () => {
    const onRetry = vi.fn()
    const { user } = setup({ isLoading: true, loadError: true, onRetry })
    expect(screen.getByRole('status')).toHaveTextContent('Loading saved locations')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
  it('opens with the map and saved pins visible before any choice', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-map-key')
    setup()
    expect(screen.getByRole('region', { name: 'Location map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select North Pasture' })).toBeInTheDocument()
  })
  it('uses a saved pin directly without creating a location', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-map-key')
    const { user, onConfirm } = setup()
    await user.click(screen.getByRole('button', { name: 'Select North Pasture' }))
    expect(screen.getByRole('combobox')).toHaveValue('north')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'north', lat: 44, lng: -89 }))
  })
  it('creates a location from a map point after selecting a saved pin', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-map-key')
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ location: { ...location, id: 'new-point', name: 'Creek', lat: 43, lng: -90 } }) })
    vi.stubGlobal('fetch', fetch)
    const { user, onConfirm } = setup()
    await user.click(screen.getByRole('button', { name: 'Select North Pasture' }))
    await user.click(screen.getByRole('button', { name: 'Choose map point' }))
    expect(screen.getByRole('combobox')).toHaveValue('new')
    await user.type(screen.getByLabelText('Location name'), 'Creek')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'new-point' })))
    expect(fetch).toHaveBeenCalledWith('/api/locations', expect.objectContaining({ body: JSON.stringify({ name: 'Creek', lat: 43, lng: -90 }) }))
  })
  it('switches back to a saved pin without keeping the draft coordinates', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-map-key')
    const { user, onConfirm } = setup()
    await user.click(screen.getByRole('button', { name: 'Choose map point' }))
    await user.click(screen.getByRole('button', { name: 'Select North Pasture' }))
    expect(screen.queryByText('New location pin')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'north', lat: 44, lng: -89 }))
  })

  it('keeps the map in a fixed window with no scrolling form', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-map-key')
    setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('overflow-hidden', 'flex', 'flex-col', 'h-[min(46rem,calc(100dvh-2rem))]')
    expect(dialog).not.toHaveClass('overflow-y-auto')
    expect(screen.queryByLabelText('Latitude')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Direction notes')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Location name')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })
  it('reveals confirmation after selecting a pin without changing window size', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-map-key')
    const { user } = setup()
    const windowClasses = screen.getByRole('dialog').className
    await user.click(screen.getByRole('button', { name: 'Select North Pasture' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
    expect(screen.getByRole('dialog').className).toBe(windowClasses)
    expect(screen.getByRole('region', { name: 'Location map' })).toBeInTheDocument()
  })
  it('asks only for a name after selecting a new point', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-map-key')
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Choose map point' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    await user.type(screen.getByLabelText('Location name'), 'Creek')
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
    expect(screen.queryByLabelText('Latitude')).not.toBeInTheDocument()
  })

})
