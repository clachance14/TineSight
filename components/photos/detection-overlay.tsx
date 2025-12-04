"use client"

import { cn } from "@/lib/utils"
import type { ObjectContainBounds } from "@/lib/hooks/use-object-contain-bounds"

interface DetectionOverlayProps {
  detections: Array<{
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
    hasROI?: boolean
    isReference?: boolean
  }>
  /** Normalized image width (typically 10000 for MegaDetector coordinates) */
  imageWidth: number
  /** Normalized image height (typically 10000 for MegaDetector coordinates) */
  imageHeight: number
  visible?: boolean
  /**
   * ID of the currently selected detection (for ROI editing)
   */
  selectedDetectionId?: string | null
  onDetectionClick?: (detectionId: string) => void
  /**
   * Bounds of the actual rendered image within the container (for object-contain)
   */
  imageBounds?: ObjectContainBounds | undefined
}

export function DetectionOverlay({
  detections,
  imageWidth,
  imageHeight,
  visible = true,
  selectedDetectionId,
  onDetectionClick,
  imageBounds,
}: DetectionOverlayProps) {
  // DEBUG: Log render state
  console.log('[DetectionOverlay] Debug:', {
    visible,
    imageWidth,
    imageHeight,
    detectionsCount: detections.length,
    imageBounds,
    willRender: visible && imageWidth !== 0 && imageHeight !== 0,
  })

  if (!visible || imageWidth === 0 || imageHeight === 0) {
    console.log('[DetectionOverlay] Not rendering - conditions not met')
    return null
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {detections.map((detection) => {
        // Calculate position relative to the actual visible image area
        // imageBounds accounts for object-contain letterboxing/pillarboxing
        let left: number
        let top: number
        let width: number
        let height: number

        if (imageBounds && imageBounds.ready && imageBounds.width > 0) {
          // Use pixel-based positioning relative to visible image
          // MegaDetector bbox format: (x, y) is CENTER, (width, height) are dimensions (YOLO format)
          // All values normalized to [0, 1] then scaled to 10000 for storage
          const normalizedCenterX = detection.bboxX / imageWidth
          const normalizedCenterY = detection.bboxY / imageHeight
          const normalizedW = detection.bboxWidth / imageWidth
          const normalizedH = detection.bboxHeight / imageHeight

          // Convert center to top-left corner
          const normalizedX = normalizedCenterX - normalizedW / 2
          const normalizedY = normalizedCenterY - normalizedH / 2

          // Convert to pixels within the visible image area
          const pixelWidth = normalizedW * imageBounds.width
          const pixelHeight = normalizedH * imageBounds.height
          const pixelLeft = imageBounds.offsetX + normalizedX * imageBounds.width
          const pixelTop = imageBounds.offsetY + normalizedY * imageBounds.height

          left = pixelLeft
          top = pixelTop
          width = pixelWidth
          height = pixelHeight
        } else {
          // Fallback to percentage-based
          // MegaDetector bbox: (x, y) is CENTER, convert to top-left corner
          const normalizedCenterX = detection.bboxX / imageWidth
          const normalizedCenterY = detection.bboxY / imageHeight
          const normalizedW = detection.bboxWidth / imageWidth
          const normalizedH = detection.bboxHeight / imageHeight

          left = (normalizedCenterX - normalizedW / 2) * 100
          top = (normalizedCenterY - normalizedH / 2) * 100
          width = normalizedW * 100
          height = normalizedH * 100
        }

        const usePixels = imageBounds && imageBounds.ready && imageBounds.width > 0

        // DEBUG: Log first detection's calculated position
        if (detections.indexOf(detection) === 0) {
          console.log('[DetectionOverlay] First detection position:', {
            detectionId: detection.id,
            raw: { x: detection.bboxX, y: detection.bboxY, w: detection.bboxWidth, h: detection.bboxHeight },
            calculated: { left, top, width, height },
            usePixels,
          })
        }

        const isDeer = detection.class === "deer"
        const isLinkedToDeer = !!detection.deerId
        const isSelected = detection.id === selectedDetectionId
        const hasReference = detection.isReference

        // Color logic: selected (cyan), reference (amber), linked deer (copper), unlinked deer (green), other (blue)
        let borderColor = "border-blue-500"
        let bgColor = "bg-blue-500/10"
        let hoverBgColor = "hover:bg-blue-500/20"
        let badgeBgColor = "bg-blue-500"

        if (isSelected) {
          borderColor = "border-cyan-400"
          bgColor = "bg-cyan-400/20"
          hoverBgColor = "hover:bg-cyan-400/30"
          badgeBgColor = "bg-cyan-400"
        } else if (hasReference) {
          borderColor = "border-amber-400"
          bgColor = "bg-amber-400/10"
          hoverBgColor = "hover:bg-amber-400/20"
          badgeBgColor = "bg-amber-400"
        } else if (isLinkedToDeer) {
          borderColor = "border-copper"
          bgColor = "bg-copper/10"
          hoverBgColor = "hover:bg-copper/20"
          badgeBgColor = "bg-copper"
        } else if (isDeer) {
          borderColor = "border-green-500"
          bgColor = "bg-green-500/10"
          hoverBgColor = "hover:bg-green-500/20"
          badgeBgColor = "bg-green-500"
        }

        // Quality status badge color
        const qualityBadgeColor =
          detection.qualityStatus === "high_quality"
            ? "bg-green-500"
            : detection.qualityStatus === "low_quality"
            ? "bg-red-500"
            : detection.qualityStatus === "manual_review"
            ? "bg-amber-500"
            : null

        return (
          <div
            key={detection.id}
            className={cn(
              "absolute border-2 rounded transition-all duration-200",
              borderColor,
              bgColor,
              onDetectionClick && "pointer-events-auto cursor-pointer",
              onDetectionClick && hoverBgColor,
              isSelected && "border-3 ring-2 ring-cyan-400/50"
            )}
            style={{
              left: usePixels ? `${left}px` : `${left}%`,
              top: usePixels ? `${top}px` : `${top}%`,
              width: usePixels ? `${width}px` : `${width}%`,
              height: usePixels ? `${height}px` : `${height}%`,
            }}
            onClick={() => onDetectionClick?.(detection.id)}
          >
            {/* Confidence badge */}
            <div
              className={cn(
                "absolute top-1 left-1 px-1.5 py-0.5 rounded text-xs font-medium text-cream",
                badgeBgColor
              )}
            >
              {Math.round(detection.confidence * 100)}%
            </div>

            {/* Reference indicator */}
            {hasReference && !isSelected && (
              <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-400 text-slate-900">
                REF
              </div>
            )}

            {/* Quality status badge */}
            {qualityBadgeColor && detection.qualityScore !== null && detection.qualityScore !== undefined && (
              <div
                className={cn(
                  "absolute top-7 left-1 px-1.5 py-0.5 rounded text-xs font-medium text-cream",
                  qualityBadgeColor
                )}
              >
                Q: {Math.round(detection.qualityScore * 100)}%
              </div>
            )}

            {/* Selected indicator */}
            {isSelected && (
              <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-xs font-medium bg-cyan-400 text-slate-900">
                SELECTED
              </div>
            )}

            {/* Deer ID badge (if linked) */}
            {detection.deerId && (
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-xs font-medium bg-slate-deep/80 text-cream">
                Deer #{detection.deerId.slice(0, 6)}
              </div>
            )}

            {/* ROI indicator */}
            {detection.hasROI && !isSelected && (
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-xs font-medium bg-copper/80 text-cream">
                ROI
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
