"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"

/**
 * ROI coordinates in normalized 0-10000 scale
 */
export interface ROICoordinates {
  x: number
  y: number
  width: number
  height: number
}

interface ROISelectorProps {
  /**
   * Existing ROI to display (normalized 0-10000)
   */
  existingROI?: ROICoordinates | null
  /**
   * Detection bounding box (normalized 0-1 from MegaDetector)
   */
  detectionBbox?: {
    x: number
    y: number
    width: number
    height: number
  } | null
  /**
   * Whether selection is enabled
   */
  enabled?: boolean
  /**
   * Whether the ROI is marked as a reference
   */
  isReference?: boolean
  /**
   * Callback when ROI selection is completed
   */
  onROIChange?: (roi: ROICoordinates | null) => void
  /**
   * Optional class name for the container
   */
  className?: string
}

/**
 * Canvas-based ROI selector for drawing region of interest on detection images.
 * Supports mouse and touch input.
 */
export function ROISelector({
  existingROI,
  detectionBbox,
  enabled = true,
  isReference = false,
  onROIChange,
  className,
}: ROISelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [currentROI, setCurrentROI] = useState<ROICoordinates | null>(existingROI ?? null)

  // Update current ROI when existingROI prop changes
  useEffect(() => {
    setCurrentROI(existingROI ?? null)
  }, [existingROI])

  // Convert normalized ROI (0-10000) to percentage for display
  const roiToPercent = useCallback((roi: ROICoordinates) => {
    return {
      left: (roi.x / 10000) * 100,
      top: (roi.y / 10000) * 100,
      width: (roi.width / 10000) * 100,
      height: (roi.height / 10000) * 100,
    }
  }, [])

  // Convert pixel coordinates to normalized (0-10000)
  const pixelToNormalized = useCallback(
    (pixelX: number, pixelY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }

      const relativeX = Math.max(0, Math.min(pixelX - rect.left, rect.width))
      const relativeY = Math.max(0, Math.min(pixelY - rect.top, rect.height))

      return {
        x: Math.round((relativeX / rect.width) * 10000),
        y: Math.round((relativeY / rect.height) * 10000),
      }
    },
    []
  )

  // Handle mouse/touch down - start drawing
  const handleStart = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled) return

      const normalized = pixelToNormalized(clientX, clientY)
      setStartPoint(normalized)
      setIsDrawing(true)
      setCurrentROI(null)
    },
    [enabled, pixelToNormalized]
  )

  // Handle mouse/touch move - update preview
  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDrawing || !startPoint) return

      const normalized = pixelToNormalized(clientX, clientY)

      // Calculate ROI from start to current point
      const x = Math.min(startPoint.x, normalized.x)
      const y = Math.min(startPoint.y, normalized.y)
      const width = Math.abs(normalized.x - startPoint.x)
      const height = Math.abs(normalized.y - startPoint.y)

      setCurrentROI({ x, y, width, height })
    },
    [isDrawing, startPoint, pixelToNormalized]
  )

  // Handle mouse/touch up - finish drawing
  const handleEnd = useCallback(() => {
    if (!isDrawing) return

    setIsDrawing(false)
    setStartPoint(null)

    // Only save if ROI has meaningful size (at least 100 units = 1%)
    if (currentROI && currentROI.width >= 100 && currentROI.height >= 100) {
      onROIChange?.(currentROI)
    } else if (currentROI) {
      // ROI too small, reset
      setCurrentROI(existingROI ?? null)
    }
  }, [isDrawing, currentROI, existingROI, onROIChange])

  // Mouse event handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      handleStart(e.clientX, e.clientY)
    },
    [handleStart]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      handleMove(e.clientX, e.clientY)
    },
    [handleMove]
  )

  const handleMouseUp = useCallback(() => {
    handleEnd()
  }, [handleEnd])

  // Touch event handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault()
        const touch = e.touches[0]
        if (touch) {
          handleStart(touch.clientX, touch.clientY)
        }
      }
    },
    [handleStart]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0]
        if (touch) {
          handleMove(touch.clientX, touch.clientY)
        }
      }
    },
    [handleMove]
  )

  const handleTouchEnd = useCallback(() => {
    handleEnd()
  }, [handleEnd])

  // Global mouse up listener (in case mouse leaves container while drawing)
  useEffect(() => {
    if (isDrawing) {
      const handleGlobalMouseUp = () => handleEnd()
      window.addEventListener("mouseup", handleGlobalMouseUp)
      window.addEventListener("touchend", handleGlobalMouseUp)

      return () => {
        window.removeEventListener("mouseup", handleGlobalMouseUp)
        window.removeEventListener("touchend", handleGlobalMouseUp)
      }
    }
    return undefined
  }, [isDrawing, handleEnd])

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0",
        enabled && "cursor-crosshair",
        className
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Detection bounding box (from MegaDetector) */}
      {detectionBbox && (
        <div
          className="absolute border-2 border-dashed border-cream/50 rounded pointer-events-none"
          style={{
            left: `${detectionBbox.x * 100}%`,
            top: `${detectionBbox.y * 100}%`,
            width: `${detectionBbox.width * 100}%`,
            height: `${detectionBbox.height * 100}%`,
          }}
        >
          <span className="absolute -top-5 left-0 text-xs text-cream/70 bg-slate-deep/80 px-1 rounded">
            Detection
          </span>
        </div>
      )}

      {/* Current ROI selection */}
      {currentROI && currentROI.width > 0 && currentROI.height > 0 && (
        <div
          className={cn(
            "absolute border-2 rounded pointer-events-none transition-all",
            isDrawing
              ? "border-copper/80 bg-copper/10"
              : isReference
              ? "border-amber-400 bg-amber-400/20"
              : "border-copper bg-copper/20"
          )}
          style={{
            left: `${roiToPercent(currentROI).left}%`,
            top: `${roiToPercent(currentROI).top}%`,
            width: `${roiToPercent(currentROI).width}%`,
            height: `${roiToPercent(currentROI).height}%`,
          }}
        >
          {!isDrawing && (
            <span
              className={cn(
                "absolute -top-5 left-0 text-xs px-1 rounded",
                isReference
                  ? "text-amber-400 bg-slate-deep/80"
                  : "text-copper bg-slate-deep/80"
              )}
            >
              {isReference ? "Reference ROI" : "ROI"}
            </span>
          )}
        </div>
      )}

      {/* Drawing instructions */}
      {enabled && !currentROI && !isDrawing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-slate-deep/80 px-3 py-2 rounded text-sm text-cream/80">
            Click and drag to select head/antler region
          </div>
        </div>
      )}
    </div>
  )
}
