"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { DetectionOverlay } from "./detection-overlay"
import { ROISelector, type ROICoordinates } from "./roi-selector"
import { ROIControlPanel } from "./roi-control-panel"
import { QualityFeedbackDialog, type FeedbackType } from "./quality-feedback-dialog"
import { ROIErrorBoundary } from "./roi-error-boundary"
import {
  useROI,
  useSaveROI,
  useDeleteROI,
  useToggleROIReference,
  useRegenerateEmbedding,
  useSubmitFeedback,
  apiRoiToCoordinates,
} from "@/lib/hooks/use-roi"
import { useToast } from "@/lib/hooks/use-toast"
import { useObjectContainBounds } from "@/lib/hooks/use-object-contain-bounds"

interface Detection {
  id: string
  bboxX: number
  bboxY: number
  bboxWidth: number
  bboxHeight: number
  confidence: number
  class: string | null
  deerId: string | null
  qualityStatus?: string | null
  qualityScore?: number | null
}

interface PhotoDetailClientProps {
  /**
   * Signed URL for the photo image
   */
  imageUrl: string
  /**
   * List of detections for this photo
   */
  detections: Detection[]
  /**
   * Image dimensions
   */
  imageWidth: number
  imageHeight: number
  /**
   * Whether detection overlay should be visible
   */
  showDetections?: boolean
  /**
   * User's current reference ROI count
   */
  referenceCount?: number
}

/**
 * Client-side wrapper for photo detail page that manages ROI selection state
 * and interaction between detection overlay, ROI selector, and control panel.
 */
export function PhotoDetailClient({
  imageUrl,
  detections,
  imageWidth,
  imageHeight,
  showDetections = true,
  referenceCount = 0,
}: PhotoDetailClientProps) {
  const { toast } = useToast()

  // Ref for container to calculate object-contain bounds
  const containerRef = useRef<HTMLDivElement>(null)

  // State for natural image dimensions (detected on load)
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 0, height: 0 })

  // Calculate object-contain bounds for proper overlay positioning
  const imageBounds = useObjectContainBounds({
    containerRef,
    naturalWidth: naturalDimensions.width,
    naturalHeight: naturalDimensions.height,
  })

  // DEBUG: Log state for troubleshooting
  console.log('[PhotoDetailClient] Debug:', {
    showDetections,
    detectionsCount: detections.length,
    naturalDimensions,
    imageBounds,
    imageWidth,
    imageHeight,
  })

  // State for selected detection and ROI drawing
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null)
  const [localROI, setLocalROI] = useState<ROICoordinates | null>(null)
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)

  // Find the selected detection
  const selectedDetection = detections.find((d) => d.id === selectedDetectionId)

  // Fetch ROI data for selected detection
  const { data: roiData } = useROI(selectedDetectionId ?? "")

  // Mutations
  const saveROI = useSaveROI()
  const deleteROI = useDeleteROI()
  const toggleReference = useToggleROIReference()
  const regenerateEmbedding = useRegenerateEmbedding()
  const submitFeedback = useSubmitFeedback()

  // Sync local ROI with server data when it loads
  useEffect(() => {
    if (roiData?.roi) {
      setLocalROI(apiRoiToCoordinates(roiData.roi))
    } else {
      setLocalROI(null)
    }
  }, [roiData])

  // Handle detection click - select for ROI drawing
  const handleDetectionClick = useCallback((detectionId: string) => {
    setSelectedDetectionId((prev) => (prev === detectionId ? null : detectionId))
    setLocalROI(null) // Reset local ROI when switching detections
  }, [])

  // Handle ROI change from selector
  const handleROIChange = useCallback((roi: ROICoordinates | null) => {
    setLocalROI(roi)
  }, [])

  // Handle save ROI
  const handleSaveROI = useCallback(async () => {
    if (!selectedDetectionId || !localROI) return

    try {
      await saveROI.mutateAsync({
        detectionId: selectedDetectionId,
        roi: localROI,
      })
      toast({
        title: "ROI Saved",
        description: "Region of interest has been saved successfully.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save ROI",
        variant: "destructive",
      })
    }
  }, [selectedDetectionId, localROI, saveROI, toast])

  // Handle clear ROI
  const handleClearROI = useCallback(async () => {
    if (!selectedDetectionId) return

    // If ROI is saved, delete it from server
    if (roiData?.roi) {
      try {
        await deleteROI.mutateAsync(selectedDetectionId)
        toast({
          title: "ROI Cleared",
          description: "Region of interest has been removed.",
        })
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete ROI",
          variant: "destructive",
        })
      }
    }

    // Clear local state
    setLocalROI(null)
  }, [selectedDetectionId, roiData?.roi, deleteROI, toast])

  // Handle toggle reference
  const handleToggleReference = useCallback(async () => {
    if (!selectedDetectionId || !roiData?.roi) return

    try {
      await toggleReference.mutateAsync({
        detectionId: selectedDetectionId,
        isReference: !roiData.roi.is_reference,
      })
      toast({
        title: roiData.roi.is_reference ? "Reference Removed" : "Marked as Reference",
        description: roiData.roi.is_reference
          ? "This ROI is no longer a quality reference."
          : "This ROI will be used as a quality reference.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update reference status",
        variant: "destructive",
      })
    }
  }, [selectedDetectionId, roiData?.roi, toggleReference, toast])

  // Handle regenerate embedding
  const handleRegenerateEmbedding = useCallback(async () => {
    if (!selectedDetectionId) return

    try {
      await regenerateEmbedding.mutateAsync(selectedDetectionId)
      toast({
        title: "Embedding Regeneration Started",
        description: "A new embedding will be generated from the ROI region. This may take up to 60 seconds.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start embedding regeneration",
        variant: "destructive",
      })
    }
  }, [selectedDetectionId, regenerateEmbedding, toast])

  // Handle submit feedback
  const handleSubmitFeedback = useCallback(
    async (feedbackType: FeedbackType, notes: string | null) => {
      if (!selectedDetectionId) return

      try {
        await submitFeedback.mutateAsync({
          detectionId: selectedDetectionId,
          feedbackType,
          notes,
        })
        setIsFeedbackOpen(false)
        toast({
          title: "Feedback Submitted",
          description: "Thank you for helping improve detection quality.",
        })
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to submit feedback",
          variant: "destructive",
        })
      }
    },
    [selectedDetectionId, submitFeedback, toast]
  )

  // Get detection bbox in 0-1 format for ROI selector
  const getDetectionBbox = () => {
    if (!selectedDetection) return null
    return {
      x: selectedDetection.bboxX / imageWidth,
      y: selectedDetection.bboxY / imageHeight,
      width: selectedDetection.bboxWidth / imageWidth,
      height: selectedDetection.bboxHeight / imageHeight,
    }
  }

  // Determine ROI state
  const hasROI = localROI !== null && localROI.width > 0 && localROI.height > 0
  const isSaved = !!roiData?.roi
  const isReference = roiData?.roi?.is_reference ?? false

  return (
    <div className="relative">
      {/* Main photo view with overlays */}
      <Card>
        <CardContent className="p-0">
          <div
            ref={containerRef}
            className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-deep"
          >
            <Image
              src={imageUrl}
              alt="Game camera photo"
              fill
              className="object-contain"
              priority
              onLoad={(e) => {
                const img = e.currentTarget as HTMLImageElement
                setNaturalDimensions({
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                })
              }}
            />

            {/* Detection overlay */}
            <DetectionOverlay
              detections={detections}
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              visible={showDetections}
              selectedDetectionId={selectedDetectionId}
              onDetectionClick={handleDetectionClick}
              imageBounds={imageBounds.ready ? imageBounds : undefined}
            />

            {/* ROI selector - only shown when a detection is selected */}
            {selectedDetectionId && (
              <ROIErrorBoundary>
                <ROISelector
                  existingROI={localROI}
                  detectionBbox={getDetectionBbox()}
                  enabled={true}
                  isReference={isReference}
                  onROIChange={handleROIChange}
                />
              </ROIErrorBoundary>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ROI Control Panel - shown when detection is selected */}
      {selectedDetectionId && (
        <div className="mt-4">
          <ROIErrorBoundary>
            <ROIControlPanel
              hasROI={hasROI}
              isSaved={isSaved}
              isReference={isReference}
              qualityStatus={(selectedDetection?.qualityStatus ?? null) as "pending" | "high_quality" | "low_quality" | "manual_review" | null}
              qualityScore={selectedDetection?.qualityScore ?? null}
              referenceCount={referenceCount}
              minReferencesRequired={3}
              onSave={handleSaveROI}
              onClear={handleClearROI}
              onToggleReference={handleToggleReference}
              onRegenerateEmbedding={handleRegenerateEmbedding}
              onOpenFeedback={() => setIsFeedbackOpen(true)}
              isSaving={saveROI.isPending}
              isRegenerating={regenerateEmbedding.isPending}
            />
          </ROIErrorBoundary>
        </div>
      )}

      {/* Selection hint when no detection selected */}
      {!selectedDetectionId && detections.length > 0 && (
        <div className="mt-4 p-4 rounded-lg bg-slate-deep/50 border border-cream/10 text-center">
          <p className="text-sm text-cream/70">
            Click on a detection bounding box above to select it and draw an ROI.
          </p>
        </div>
      )}

      {/* Quality Feedback Dialog */}
      {selectedDetectionId && (
        <QualityFeedbackDialog
          open={isFeedbackOpen}
          onOpenChange={setIsFeedbackOpen}
          detectionId={selectedDetectionId}
          onSubmit={handleSubmitFeedback}
          isSubmitting={submitFeedback.isPending}
        />
      )}
    </div>
  )
}
