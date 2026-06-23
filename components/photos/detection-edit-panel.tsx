"use client"

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useDetection, useUpdateDetection, useDeleteDetection } from '@/lib/hooks/use-detection'
import { useDetectionEdit } from '@/lib/stores/detection-edit'
import { useToast } from '@/lib/hooks/use-toast'
import { DeleteConfirmationDialog } from './delete-confirmation-dialog'
import { CreateDeerModal } from '@/components/deer/create-deer-modal'
import { DeerProfileDropdown } from '@/components/deer/deer-profile-dropdown'
import { AntlerPrintCard } from '@/components/deer/antler-print-card'
import { useQueryClient } from '@tanstack/react-query'
import {
  detectionEditFormSchema,
  type DetectionEditFormValues,
  SEX_OPTIONS,
  AGE_CLASS_OPTIONS,
  SPECIES_OPTIONS,
  SIZE_CLASS_OPTIONS,
  ESTIMATED_POINT_RANGE_OPTIONS,
  SEX_LABELS,
  AGE_CLASS_LABELS,
  SPECIES_LABELS,
  SIZE_CLASS_LABELS,
  ESTIMATED_POINT_RANGE_LABELS,
} from '@/lib/validations/detection'

export function DetectionEditPanel() {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { selectedDetectionId, isOpen, closePanel } = useDetectionEdit()
  const { data: detection, isLoading } = useDetection(selectedDetectionId || '')
  const updateDetection = useUpdateDetection()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const deleteDetection = useDeleteDetection()

  // The edit-panel Sheet is modal={false}; opening a nested Dialog/Dropdown
  // shifts focus out and closes it, which nulls selectedDetectionId and drops
  // the live `detection` query. So we snapshot the detection the moment a deer
  // action starts — otherwise the create POST loses detection_id (400) and the
  // link PATCH silently no-ops.
  const [createSnapshot, setCreateSnapshot] = useState<{
    id: string
    cropUrl: string | null
    imageUrl: string | null
    bboxX: number | null
    bboxY: number | null
    bboxWidth: number | null
    bboxHeight: number | null
  } | null>(null)
  // Stable fallback id that survives the panel closing (for link-to-existing).
  const lastDetectionIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (detection?.id) lastDetectionIdRef.current = detection.id
  }, [detection?.id])

  const form = useForm<DetectionEditFormValues>({
    resolver: zodResolver(detectionEditFormSchema),
    defaultValues: {
      sex: null,
      sizeClass: null,
      estimatedPointRange: null,
      ageClass: null,
      species: null,
      distinguishingFeatures: null,
    },
  })

  // Reset form when detection changes
  useEffect(() => {
    if (detection) {
      form.reset({
        sex: detection.sex as DetectionEditFormValues['sex'],
        sizeClass: detection.sizeClass as DetectionEditFormValues['sizeClass'],
        estimatedPointRange: detection.estimatedPointRange as DetectionEditFormValues['estimatedPointRange'],
        ageClass: detection.ageClass as DetectionEditFormValues['ageClass'],
        species: detection.species as DetectionEditFormValues['species'],
        distinguishingFeatures: detection.distinguishingFeatures,
      })
    }
  }, [detection, form])

  const onSubmit = async (data: DetectionEditFormValues) => {
    if (!selectedDetectionId) return

    try {
      await updateDetection.mutateAsync({
        detectionId: selectedDetectionId,
        data: {
          sex: data.sex,
          sizeClass: data.sizeClass,
          estimatedPointRange: data.estimatedPointRange,
          ageClass: data.ageClass,
          species: data.species,
          distinguishingFeatures: data.distinguishingFeatures,
        },
      })
      toast({
        title: 'Detection Updated',
        description: 'Classification changes have been saved.',
      })
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save changes',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async () => {
    if (!selectedDetectionId) return

    try {
      await deleteDetection.mutateAsync({
        detectionId: selectedDetectionId,
        ...(detection?.imageId && { imageId: detection.imageId })
      })
      setIsDeleteDialogOpen(false)
      closePanel()
      toast({
        title: 'Detection Deleted',
        description: 'The detection has been removed.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete detection',
        variant: 'destructive',
      })
    }
  }

  const handleLinkToExisting = async (deerId: string) => {
    // Opening the deer dropdown can close the non-modal Sheet (nulling
    // selectedDetectionId), so fall back to the snapshotted id.
    const detectionId = selectedDetectionId ?? lastDetectionIdRef.current
    if (!detectionId) return

    setIsLinking(true)
    try {
      await updateDetection.mutateAsync({
        detectionId,
        data: { deerId },
      })
      // Invalidate deer catalog to update sighting counts
      queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
      closePanel()
      toast({
        title: 'Detection Linked',
        description: 'Successfully added to deer profile.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to link detection',
        variant: 'destructive',
      })
    } finally {
      setIsLinking(false)
    }
  }

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'Escape') {
        closePanel()
      }

      // Cmd/Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        form.handleSubmit(onSubmit)()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closePanel, form, onSubmit])

  return (
    <>
    <Sheet open={isOpen} onOpenChange={(open) => !open && closePanel()} modal={false}>
      <SheetContent
        side="right"
        className="w-full sm:w-[400px] sm:max-w-md bg-slate-deep border-l border-cream/20 flex flex-col"
      >
        <SheetHeader className="flex-none space-y-1">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-cream">Edit Detection</SheetTitle>
            {form.formState.isDirty && (
              <span className="text-amber-400 text-xs font-medium">• Unsaved</span>
            )}
          </div>
          <SheetDescription className="text-cream-dark">
            Correct AI classification for this detection
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-copper" />
            </div>
          ) : (
            <div className="px-4 space-y-4">
            {/* Edit Form */}
            <form onSubmit={form.handleSubmit(onSubmit)} id="detection-edit-form" className="space-y-3">
              {/* Sex */}
              <div className="space-y-2">
                <Label htmlFor="sex" className="text-cream">
                  Sex
                </Label>
                <div className="relative">
                  <select
                    id="sex"
                    {...form.register('sex')}
                    className="w-full h-9 px-3 pr-10 rounded-md bg-slate border border-cream/20 text-cream focus:border-copper focus:ring-1 focus:ring-copper appearance-none cursor-pointer text-sm"
                  >
                    <option value="">Select sex...</option>
                    {SEX_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {SEX_LABELS[option]}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-cream/50">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {form.formState.errors.sex && (
                  <p className="text-red-400 text-sm">{form.formState.errors.sex.message}</p>
                )}
              </div>

              {/* Size Class */}
              <div className="space-y-2">
                <Label htmlFor="sizeClass" className="text-cream">
                  Size Class
                </Label>
                <div className="relative">
                  <select
                    id="sizeClass"
                    {...form.register('sizeClass')}
                    className="w-full h-9 px-3 pr-10 rounded-md bg-slate border border-cream/20 text-cream focus:border-copper focus:ring-1 focus:ring-copper appearance-none cursor-pointer text-sm"
                  >
                    <option value="">Select size class...</option>
                    {SIZE_CLASS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {SIZE_CLASS_LABELS[option]}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-cream/50">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {form.formState.errors.sizeClass && (
                  <p className="text-red-400 text-sm">{form.formState.errors.sizeClass.message}</p>
                )}
              </div>

              {/* Estimated Point Range */}
              <div className="space-y-2">
                <Label htmlFor="estimatedPointRange" className="text-cream">
                  Estimated Point Range
                </Label>
                <div className="relative">
                  <select
                    id="estimatedPointRange"
                    {...form.register('estimatedPointRange')}
                    className="w-full h-9 px-3 pr-10 rounded-md bg-slate border border-cream/20 text-cream focus:border-copper focus:ring-1 focus:ring-copper appearance-none cursor-pointer text-sm"
                  >
                    <option value="">Select point range...</option>
                    {ESTIMATED_POINT_RANGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {ESTIMATED_POINT_RANGE_LABELS[option]}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-cream/50">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {form.formState.errors.estimatedPointRange && (
                  <p className="text-red-400 text-sm">{form.formState.errors.estimatedPointRange.message}</p>
                )}
              </div>

              {/* Age Class */}
              <div className="space-y-2">
                <Label htmlFor="ageClass" className="text-cream">
                  Age Class
                </Label>
                <div className="relative">
                  <select
                    id="ageClass"
                    {...form.register('ageClass')}
                    className="w-full h-9 px-3 pr-10 rounded-md bg-slate border border-cream/20 text-cream focus:border-copper focus:ring-1 focus:ring-copper appearance-none cursor-pointer text-sm"
                  >
                    <option value="">Select age class...</option>
                    {AGE_CLASS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {AGE_CLASS_LABELS[option]}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-cream/50">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {form.formState.errors.ageClass && (
                  <p className="text-red-400 text-sm">{form.formState.errors.ageClass.message}</p>
                )}
              </div>

              {/* Species */}
              <div className="space-y-2">
                <Label htmlFor="species" className="text-cream">
                  Species
                </Label>
                <div className="relative">
                  <select
                    id="species"
                    {...form.register('species')}
                    className="w-full h-9 px-3 pr-10 rounded-md bg-slate border border-cream/20 text-cream focus:border-copper focus:ring-1 focus:ring-copper appearance-none cursor-pointer text-sm"
                  >
                    <option value="">Select species...</option>
                    {SPECIES_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {SPECIES_LABELS[option]}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-cream/50">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {form.formState.errors.species && (
                  <p className="text-red-400 text-sm">{form.formState.errors.species.message}</p>
                )}
              </div>

              {/* Distinguishing Features */}
              <div className="space-y-2">
                <Label htmlFor="distinguishingFeatures" className="text-cream">
                  Distinguishing Features
                </Label>
                <textarea
                  id="distinguishingFeatures"
                  {...form.register('distinguishingFeatures')}
                  placeholder="Describe unique marks, scars, or features..."
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-md bg-slate border border-cream/20 text-cream placeholder:text-cream/50 focus:border-copper focus:ring-1 focus:ring-copper resize-none"
                />
                <div className="flex justify-between text-xs text-cream-dark">
                  <span>
                    {form.formState.errors.distinguishingFeatures?.message || 'Max 500 characters'}
                  </span>
                  <span>
                    {(form.watch('distinguishingFeatures') || '').length}/500
                  </span>
                </div>
              </div>

            </form>

            {/* Antler Print for Trophy Detections */}
            {detection?.sizeClass === 'trophy' && (
              <div className="pt-4 border-t border-cream/10">
                <AntlerPrintCard fingerprint={detection.antlerFingerprint} />
              </div>
            )}
          </div>
        )}
        </div>

        {/* Sticky Footer */}
        {!isLoading && (
          <div className="flex-none border-t border-cream/10 p-4 bg-slate-deep space-y-3">
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={closePanel}
                className="flex-1 h-9 border-cream/20 text-cream hover:bg-slate hover:text-cream text-sm"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="detection-edit-form"
                disabled={updateDetection.isPending}
                className="flex-1 h-9 bg-copper hover:bg-copper-light text-white text-sm"
              >
                {updateDetection.isPending ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Saving...
                  </>
                ) : showSuccess ? (
                  <>
                    <span className="mr-2">✓</span>
                    Saved!
                  </>
                ) : (
                  <>
                    Save Changes
                    <span className="text-xs text-white/50 ml-1">(⌘S)</span>
                  </>
                )}
              </Button>
            </div>
            {detection && detection.sex === 'buck' && !detection.deerId && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="flex-1 h-9 bg-copper hover:bg-copper-light text-white text-sm"
                  onClick={() => {
                    // Snapshot before the Sheet can close and drop the query.
                    setCreateSnapshot({
                      id: detection.id,
                      cropUrl: detection.cropUrl,
                      imageUrl: detection.imageUrl,
                      bboxX: detection.bboxX,
                      bboxY: detection.bboxY,
                      bboxWidth: detection.bboxWidth,
                      bboxHeight: detection.bboxHeight,
                    })
                    setCreateModalOpen(true)
                  }}
                >
                  Create Deer Profile
                </Button>
                <DeerProfileDropdown
                  onSelect={handleLinkToExisting}
                  disabled={isLinking}
                />
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="w-full h-9 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-sm"
            >
              Delete Detection
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>

    <DeleteConfirmationDialog
      open={isDeleteDialogOpen}
      onOpenChange={setIsDeleteDialogOpen}
      onConfirm={handleDelete}
      isDeleting={deleteDetection.isPending}
    />

    <CreateDeerModal
      open={createModalOpen}
      onOpenChange={(open) => {
        setCreateModalOpen(open)
        if (!open) setCreateSnapshot(null)
      }}
      detectionId={createSnapshot?.id ?? ''}
      cropUrl={createSnapshot?.cropUrl}
      imageUrl={createSnapshot?.imageUrl}
      bbox={createSnapshot?.bboxX != null ? {
        x: createSnapshot.bboxX,
        y: createSnapshot.bboxY!,
        width: createSnapshot.bboxWidth!,
        height: createSnapshot.bboxHeight!,
      } : null}
      onSuccess={(deer) => router.push(`/deer/${deer.id}`)}
    />
    </>
  )
}
