import { beforeEach, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DetectionEditPanel } from '@/components/photos/detection-edit-panel'
import { DetectionCardWithFeedback } from '@/components/photos/detection-card-with-feedback'
import { useDetectionEdit } from '@/lib/stores/detection-edit'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/deer/create-deer-modal', () => ({ CreateDeerModal: ({ open }: { open: boolean }) => open ? <p>Create profile form</p> : null }))
vi.mock('@/lib/hooks/use-deer', () => ({ useDeerCatalog: () => ({ data: { deer: [{ id: 'existing-deer', name: 'Big Ten', reference_image_url: null }] }, isLoading: false, error: null }) }))
vi.mock('@/components/deer/antler-print-card', () => ({ AntlerPrintCard: () => <p>Antler details</p> }))
vi.mock('@/components/photos/detection-roi-editor', () => ({ DetectionROIEditor: ({ onBack }: { onBack: () => void }) => <div>ROI drawing tools<button onClick={onBack}>Back to details</button></div> }))
const detection = vi.hoisted(() => ({ id: 'deer-one', species: 'whitetail', sex: 'buck', sizeClass: 'trophy', estimatedPointRange: '10-12', ageClass: 'mature', distinguishingFeatures: 'Split brow tine', antlerFingerprint: null }))
vi.mock('@/lib/hooks/use-detection', () => ({
  useDetection: () => ({ data: detection, isLoading: false }),
  useUpdateDetection: () => ({ mutateAsync: vi.fn() }),
  useDeleteDetection: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/lib/hooks/use-roi', () => ({ useFeedback: () => ({ data: { feedback: [] } }) }))

beforeEach(() => useDetectionEdit.getState().closePanel())

it('opens trophy details on selection, with ROI editing as a separate step and a way back', async () => {
  const user = userEvent.setup()
  render(<QueryClientProvider client={new QueryClient()}>
    <DetectionCardWithFeedback detection={{ id: 'deer-one', confidence: 0.9, bboxX: 0, bboxY: 0, bboxWidth: 1, bboxHeight: 1, sex: 'buck', sizeClass: 'trophy' }} index={0} />
    <DetectionEditPanel />
  </QueryClientProvider>)
  await user.click(screen.getByRole('button', { name: 'Detection 1' }))
  expect(screen.getByRole('heading', { name: 'Deer details' })).toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: 'Deer details' })).toBeInTheDocument()
  expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeInTheDocument()
  expect(screen.getByText('Split brow tine')).toBeInTheDocument()
  expect(screen.queryByText('ROI drawing tools')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Sex')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Edit details' }))
  await user.click(screen.getByRole('button', { name: 'Edit ROI' }))
  expect(screen.getByText('ROI drawing tools')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Back to details' }))
  expect(screen.getByText('Split brow tine')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Edit details' }))
  expect(screen.getByLabelText('Sex')).toBeInTheDocument()
  act(() => useDetectionEdit.getState().openPanel('deer-two'))
  expect(screen.getByRole('heading', { name: 'Deer details' })).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(useDetectionEdit.getState().isOpen).toBe(false)
})

it('offers new and existing identities from the summary', async () => {
  const user = userEvent.setup()
  act(() => useDetectionEdit.getState().openPanel('deer-one'))
  render(<QueryClientProvider client={new QueryClient()}><DetectionEditPanel /></QueryClientProvider>)
  expect(screen.getByRole('option', { name: 'Big Ten' })).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Identify deer' }), '__create__')
  expect(screen.getByText('Create profile form')).toBeInTheDocument()
})
