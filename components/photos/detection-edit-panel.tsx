"use client"

import { useEffect, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDetection, useUpdateDetection, useDeleteDetection } from '@/lib/hooks/use-detection'
import { useDetectionEdit } from '@/lib/stores/detection-edit'
import { useToast } from '@/lib/hooks/use-toast'
import { DeleteConfirmationDialog } from './delete-confirmation-dialog'
import { CreateDeerModal } from '@/components/deer/create-deer-modal'
import { cn } from '@/lib/utils'
import {
  detectionEditFormSchema,
  type DetectionEditFormValues,
  SEX_OPTIONS,
  AGE_CLASS_OPTIONS,
  SPECIES_OPTIONS,
  SEX_LABELS,
  AGE_CLASS_LABELS,
  SPECIES_LABELS,
} from '@/lib/validations/detection'

interface DetectionEditPanelProps {
  /**
   * Full image URL for displaying detection thumbnail
   */
  imageUrl?: string
  /**
   * Image dimensions for calculating crop position
   */
  imageWidth?: number
  imageHeight?: number
}

export function DetectionEditPanel({
  imageUrl,
  imageWidth = 10000,
  imageHeight = 10000,
}: DetectionEditPanelProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { selectedDetectionId, isOpen, closePanel } = useDetectionEdit()
  const { data: detection, isLoading } = useDetection(selectedDetectionId || '')
  const updateDetection = useUpdateDetection()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const deleteDetection = useDeleteDetection()

  const form = useForm<DetectionEditFormValues>({
    resolver: zodResolver(detectionEditFormSchema),
    defaultValues: {
      sex: null,
      antlerPoints: null,
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
        antlerPoints: detection.antlerPoints,
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
          antlerPoints: data.antlerPoints,
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
      await deleteDetection.mutateAsync(selectedDetectionId)
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

  // Calculate thumbnail style using background-image
  // IMPORTANT: bbox is in YOLO format (center-based, normalized to 10000)
  const getThumbnailStyle = () => {
    if (!detection || !detection.bboxX || !detection.bboxY ||
        !detection.bboxWidth || !detection.bboxHeight) {
      return {
        backgroundImage: `url(${imageUrl || detection?.imageUrl || ''})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    }

    // Bbox is CENTER-based, normalized to imageWidth/imageHeight (typically 10000)
    // Convert to percentages of the image
    const centerXPct = (detection.bboxX / imageWidth) * 100
    const centerYPct = (detection.bboxY / imageHeight) * 100
    const widthPct = (detection.bboxWidth / imageWidth) * 100
    const heightPct = (detection.bboxHeight / imageHeight) * 100

    // Add 20% padding around bbox for context
    const padding = 0.20
    const regionWidthPct = widthPct * (1 + 2 * padding)
    const regionHeightPct = heightPct * (1 + 2 * padding)

    // Calculate background-size to make region fill container
    // If bbox region is 10% of image width, we need background-size of 1000% to fill container
    const bgSizeX = (100 / regionWidthPct) * 100
    const bgSizeY = (100 / regionHeightPct) * 100
    // Use max for "cover" behavior (fill container, crop overflow)
    const bgSize = Math.max(bgSizeX, bgSizeY)

    // Clamp to prevent extreme zoom (max 2000% = 20x zoom)
    const clampedBgSize = Math.min(bgSize, 2000)

    return {
      backgroundImage: `url(${imageUrl || detection.imageUrl || ''})`,
      backgroundSize: `${clampedBgSize}%`,
      backgroundPosition: `${centerXPct}% ${centerYPct}%`,
      backgroundRepeat: 'no-repeat',
    }
  }

  // Calculate bbox overlay position
  // With background-position centering the bbox, the bbox should be roughly centered
  const getBboxOverlayStyle = () => {
    if (!detection || !detection.bboxX || !detection.bboxY ||
        !detection.bboxWidth || !detection.bboxHeight) {
      return { display: 'none' }
    }

    // Must match getThumbnailStyle calculation
    const widthPct = (detection.bboxWidth / imageWidth) * 100
    const heightPct = (detection.bboxHeight / imageHeight) * 100

    const padding = 0.20
    const regionWidthPct = widthPct * (1 + 2 * padding)
    const regionHeightPct = heightPct * (1 + 2 * padding)

    // The bbox takes up (widthPct / regionWidthPct) of the visible region
    // Since region fills container, bbox width in container = container * (widthPct / regionWidthPct)
    const bboxWidthInContainer = (widthPct / regionWidthPct) * 100
    const bboxHeightInContainer = (heightPct / regionHeightPct) * 100

    // Bbox is centered in the visible region (because we added equal padding)
    // So it's at 50% - half its size
    const left = 50 - bboxWidthInContainer / 2
    const top = 50 - bboxHeightInContainer / 2

    return {
      left: `${left}%`,
      top: `${top}%`,
      width: `${bboxWidthInContainer}%`,
      height: `${bboxHeightInContainer}%`,
    }
  }

  // Get confidence badge color based on level
  const getConfidenceBadgeColor = () => {
    if (!detection?.confidence) return 'bg-slate-deep/80 text-cream'

    const confidence = detection.confidence
    if (confidence >= 0.8) return 'bg-green-600/90 text-white'
    if (confidence >= 0.6) return 'bg-yellow-600/90 text-white'
    return 'bg-red-600/90 text-white'
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
    <Sheet open={isOpen} onOpenChange={(open) => !open && closePanel()}>
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
              {/* Detection Thumbnail */}
              {(imageUrl || detection?.imageUrl) && detection?.bboxX && (
                <div className="relative w-full h-32 sm:h-40 lg:h-48 rounded-lg overflow-hidden bg-slate border border-cream/10">
                <div
                  className="w-full h-full"
                  style={getThumbnailStyle()}
                  role="img"
                  aria-label="Detection thumbnail"
                />
                <div
                  className="absolute border-2 border-copper/60 rounded pointer-events-none"
                  style={getBboxOverlayStyle()}
                />
                <div className={cn(
                  "absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium",
                  getConfidenceBadgeColor()
                )}>
                  {detection.confidence
                    ? `${Math.round(detection.confidence * 100)}%`
                    : 'N/A'}
                </div>
              </div>
            )}

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

              {/* Antler Points */}
              <div className="space-y-2">
                <Label htmlFor="antlerPoints" className="text-cream">
                  Antler Points
                </Label>
                <Input
                  id="antlerPoints"
                  type="number"
                  min={0}
                  max={30}
                  placeholder="0-30"
                  {...form.register('antlerPoints', { valueAsNumber: true })}
                  className="h-9 bg-slate border-cream/20 text-cream placeholder:text-cream/50 focus:border-copper focus:ring-copper text-sm"
                />
                {form.formState.errors.antlerPoints && (
                  <p className="text-red-400 text-sm">
                    {form.formState.errors.antlerPoints.message}
                  </p>
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
              <Button
                type="button"
                className="w-full h-9 bg-copper hover:bg-copper-light text-white text-sm"
                onClick={() => setCreateModalOpen(true)}
              >
                Create Deer Profile
              </Button>
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

      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDelete}
        isDeleting={deleteDetection.isPending}
      />

      <CreateDeerModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        detectionId={detection?.id || ''}
        onSuccess={(deer) => router.push(`/deer/${deer.id}`)}
      />
    </Sheet>
  )
}
