/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadReviewDialog } from '@/components/upload/upload-review-dialog'

function setup(count = 12) {
  const onUpload = vi.fn(), onClose = vi.fn(), onClear = vi.fn(), onChangeLocation = vi.fn()
  render(<UploadReviewDialog open count={count} totalBytes={12 * 1024 * 1024} locationName="North Pasture" onUpload={onUpload} onClose={onClose} onClear={onClear} onChangeLocation={onChangeLocation}><details><summary>Folder settings</summary><div style={{ height: 2000 }}>Many folders</div></details></UploadReviewDialog>)
  return { user: userEvent.setup(), onUpload, onClose, onClear, onChangeLocation }
}
describe('review window', () => {
  it('shows the count, location and primary upload action together', () => {
    setup()
    const dialog = within(screen.getByRole('dialog', { name: 'Ready to upload' }))
    expect(dialog.getByText('12 photos selected')).toBeInTheDocument()
    expect(dialog.getByText('North Pasture')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Upload 12 photos' })).toHaveClass('w-full', 'h-12')
    expect(screen.getByRole('dialog')).toHaveClass('overflow-hidden', 'max-h-[calc(100dvh-2rem)]')
  })
  it('keeps upload outside optional scrolling details, even when expanded', async () => {
    const { user, onUpload } = setup()
    await user.click(screen.getByText('Folder settings'))
    const details = screen.getByLabelText('Optional upload details')
    const actions = screen.getByTestId('upload-review-actions')
    expect(details).toHaveClass('min-h-0', 'overflow-y-auto')
    expect(actions).toHaveClass('shrink-0')
    expect(details).not.toContainElement(actions)
    await user.click(screen.getByRole('button', { name: 'Upload 12 photos' }))
    expect(onUpload).toHaveBeenCalledOnce()
  })
  it('change, clear and dismissal never start uploading', async () => {
    const { user, onUpload, onChangeLocation, onClear, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Change location' }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await user.click(screen.getByRole('button', { name: 'Back to photos' }))
    expect(onChangeLocation).toHaveBeenCalledOnce()
    expect(onClear).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    expect(onUpload).not.toHaveBeenCalled()
  })
  it('disables uploading an empty group', () => {
    setup(0)
    expect(screen.getByRole('button', { name: 'Upload 0 photos' })).toBeDisabled()
  })
})
