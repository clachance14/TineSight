'use client'

import type { ReactNode } from 'react'
import { Upload, MapPin, Images } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface UploadReviewDialogProps {
  open: boolean
  count: number
  totalBytes: number
  locationName: string | null
  onClose: () => void
  onChangeLocation: () => void
  onClear: () => void
  onUpload: () => void
  children?: ReactNode
}

export function UploadReviewDialog({ open, count, totalBytes, locationName, onClose, onChangeLocation, onClear, onUpload, children }: UploadReviewDialogProps): React.JSX.Element {
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl sm:p-0">
      <DialogHeader className="shrink-0 px-5 pb-3 pt-5 pr-12 text-left [@media(max-height:450px)]:py-2">
        <DialogTitle>Ready to upload</DialogTitle>
        <DialogDescription className="[@media(max-height:450px)]:hidden">Check your photo group, then upload.</DialogDescription>
      </DialogHeader>
      <div className="shrink-0 space-y-3 px-5 pb-4 [@media(max-height:450px)]:space-y-1 [@media(max-height:450px)]:pb-2">
        <div className="flex items-center gap-3 rounded-lg border border-copper/30 bg-copper/5 p-3 [@media(max-height:450px)]:py-1">
          <Images className="size-6 shrink-0 text-copper" aria-hidden="true" />
          <div><p className="text-lg font-semibold text-cream">{count.toLocaleString()} {count === 1 ? 'photo' : 'photos'} selected</p><p className="text-sm text-cream-dark">{(totalBytes / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB total</p></div>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <MapPin className="size-5 shrink-0 text-copper" aria-hidden="true" />
          <div className="min-w-0 flex-1"><p className="text-xs text-cream-dark">Group location</p><p className="truncate font-medium text-cream" title={locationName ?? 'No location assigned'}>{locationName ?? 'No location assigned'}</p></div>
          <Button variant="ghost" onClick={onChangeLocation} aria-label="Change location">Change</Button>
        </div>
      </div>
      {children !== undefined && <div className="min-h-0 overflow-y-auto overscroll-contain border-t border-slate px-5" aria-label="Optional upload details">{children}</div>}
      <div className="shrink-0 space-y-2 border-t border-slate bg-background p-4 [@media(max-height:450px)]:py-2" data-testid="upload-review-actions">
        <Button className="h-12 w-full bg-copper text-base font-semibold text-slate-deep hover:bg-copper-light" disabled={count === 0} onClick={onUpload}><Upload className="size-5" aria-hidden="true" />Upload {count.toLocaleString()} {count === 1 ? 'photo' : 'photos'}</Button>
        <div className="flex justify-between"><Button variant="ghost" size="sm" onClick={onClear}>Clear</Button><Button variant="ghost" size="sm" onClick={onClose}>Back to photos</Button></div>
      </div>
    </DialogContent>
  </Dialog>
}
