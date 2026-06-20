"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { ImageOff, Eye, EyeOff, ZoomIn } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { DetectionOverlay } from "./detection-overlay"
import { PhotoLightbox } from "./photo-lightbox"
import { DetectionEditPanel } from "./detection-edit-panel"
import { useObjectContainBounds } from "@/lib/hooks/use-object-contain-bounds"
import { useDetectionHover } from "@/lib/stores/detection-hover"
import { useDetectionEdit } from "@/lib/stores/detection-edit"
import { useUIStore } from "@/lib/stores/ui"
import { BLUR_DATA_URL } from "@/lib/constants/image"

interface Detection {
  id: string
  bboxX: number
  bboxY: number
  bboxWidth: number
  bboxHeight: number
  confidence: number
  class: string | null
  deerId: string | null
  deerName: string | null
  qualityStatus?: string | null
  qualityScore?: number | null
  antlerBbox?: { x: number; y: number; width: number; height: number } | null
}

interface PhotoDetailClientProps {
  /**
   * Signed URL for the displayed image — the MEDIUM variant (budget: never the
   * full-res original just to show a contained image). Null if missing.
   */
  imageUrl: string | null
  /**
   * Signed URL for the full-resolution original, used ONLY for explicit zoom in
   * the lightbox. Null if missing.
   */
  fullResUrl?: string | null
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
  /** Adjacent photo ids for swipe navigation (mobile). */
  prevId?: string | null
  nextId?: string | null
  /** Filter query string preserved across prev/next navigation. */
  navQueryString?: string
}

/**
 * Client-side wrapper for photo detail page that manages detection interaction
 * and displays the detection edit panel.
 */
export function PhotoDetailClient({
  imageUrl,
  fullResUrl = null,
  detections,
  imageWidth,
  imageHeight,
  showDetections = true,
  referenceCount: _referenceCount = 0,
  prevId = null,
  nextId = null,
  navQueryString = "",
}: PhotoDetailClientProps) {
  const router = useRouter()

  // Shared hover state with detection cards
  const { hoveredDetectionId, setHoveredDetectionId } = useDetectionHover()

  // Horizontal swipe -> navigate to adjacent photo (mobile). Vertical swipes are
  // ignored so page scroll is unaffected.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const navTo = useCallback(
    (id: string | null) => {
      if (id === null || id === "") return
      router.push(navQueryString !== "" ? `/photos/${id}?${navQueryString}` : `/photos/${id}`)
    },
    [router, navQueryString]
  )
  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null
  }, [])
  const handleSwipeEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current
      const t = e.changedTouches[0]
      touchStartRef.current = null
      if (!start || !t) return
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      // Horizontal intent: dominant X movement past a threshold.
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) navTo(nextId)
        else navTo(prevId)
      }
    },
    [navTo, nextId, prevId]
  )

  // Detection edit panel state
  const { openPanel } = useDetectionEdit()

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

  // State for UI controls - bounding box visibility persists across sessions
  const { showBoundingBoxes, toggleBoundingBoxes } = useUIStore()
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  // Handle detection click - open edit panel
  const handleDetectionClick = useCallback((detectionId: string) => {
    openPanel(detectionId)
  }, [openPanel])

  return (
    <div className="relative">
      {/* Main photo view with overlays */}
      <Card>
        <CardContent className="p-0">
          <div
            ref={containerRef}
            className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-deep"
          >
            {imageUrl ? (
              <>
                <Image
                  src={imageUrl}
                  alt="Game camera photo"
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
                  className="object-contain pointer-events-none"
                  priority
                  placeholder="blur"
                  blurDataURL={BLUR_DATA_URL}
                  onLoad={(e) => {
                    const img = e.currentTarget as HTMLImageElement
                    setNaturalDimensions({
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                    })
                  }}
                />

                {/* Mobile gesture overlay: tap to zoom, horizontal swipe to
                    move between photos. */}
                <div
                  className="absolute inset-0 z-10 md:hidden"
                  onTouchStart={handleSwipeStart}
                  onTouchEnd={(e) => {
                    const start = touchStartRef.current
                    const t = e.changedTouches[0]
                    handleSwipeEnd(e)
                    // Treat a near-stationary touch as a tap -> open zoom.
                    if (start && t && Math.abs(t.clientX - start.x) < 10 && Math.abs(t.clientY - start.y) < 10) {
                      setIsLightboxOpen(true)
                    }
                  }}
                  role="button"
                  aria-label="Tap to zoom, swipe to change photo"
                />

                {/* Detection overlay */}
                <DetectionOverlay
                  detections={detections}
                  imageWidth={imageWidth}
                  imageHeight={imageHeight}
                  visible={showDetections}
                  showAll={showBoundingBoxes}
                  hoveredDetectionId={hoveredDetectionId}
                  onDetectionClick={handleDetectionClick}
                  onDetectionHover={setHoveredDetectionId}
                  imageBounds={imageBounds.ready ? imageBounds : undefined}
                />

                {/* Controls */}
                <div className="absolute top-2 right-2 md:top-3 md:right-3 z-50 flex gap-1.5 md:gap-2">
                  {detections.length > 0 && (
                    <button
                      onClick={toggleBoundingBoxes}
                      className="p-2 md:px-3 md:py-1.5 bg-slate-deep/90 hover:bg-slate-deep text-cream text-sm font-medium rounded-md border border-cream/20 backdrop-blur-sm transition-colors"
                      aria-label={showBoundingBoxes ? "Hide detection boxes" : "Show detection boxes"}
                    >
                      {showBoundingBoxes ? (
                        <>
                          <EyeOff className="h-4 w-4 md:hidden" />
                          <span className="hidden md:inline">Hide Boxes</span>
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 md:hidden" />
                          <span className="hidden md:inline">Show Boxes</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setIsLightboxOpen(true)}
                    className="p-2 md:px-3 md:py-1.5 bg-slate-deep/90 hover:bg-slate-deep text-cream text-sm font-medium rounded-md border border-cream/20 backdrop-blur-sm transition-colors"
                    aria-label="Zoom in on photo"
                  >
                    <ZoomIn className="h-4 w-4 md:hidden" />
                    <span className="hidden md:inline">Zoom</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-cream-dark">
                <ImageOff className="size-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Image not found</p>
                <p className="text-sm opacity-75">The storage file for this photo is missing</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Photo Lightbox for zooming — uses the full-resolution original (the one
          place we deliberately load full-res, on explicit user zoom). Falls back
          to the medium display URL if no original is available. */}
      {imageUrl && (
        <PhotoLightbox
          imageUrl={fullResUrl ?? imageUrl}
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
        />
      )}

      {/* Detection Edit Panel */}
      <DetectionEditPanel />

      {/* Crop Lightbox removed - was covering main photo when edit panel opened */}
    </div>
  )
}
