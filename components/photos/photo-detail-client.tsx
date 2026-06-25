"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import Image from "next/image"
import { ImageOff, Eye, EyeOff, ZoomIn } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { DetectionOverlay } from "./detection-overlay"
import { PhotoLightbox } from "./photo-lightbox"
import { useObjectContainBounds } from "@/lib/hooks/use-object-contain-bounds"
import { useDetectionHover } from "@/lib/stores/detection-hover"
import { useDetectionEdit } from "@/lib/stores/detection-edit"
import { useUIStore } from "@/lib/stores/ui"
import { BLUR_DATA_URL } from "@/lib/constants/image"
import type { PhotoViewDTO } from "@/lib/services/photo-view"

interface PhotoDetailClientProps {
  photo: PhotoViewDTO
  imageWidth: number
  imageHeight: number
  /** Only the centered slide is interactive (tap-to-zoom, detection editing) and eager-loaded. */
  interactive?: boolean
  /** Called when the signed image URL fails to load (e.g. expired) so the parent can refetch. */
  onImageError?: () => void
}

export function PhotoDetailClient({
  photo,
  imageWidth,
  imageHeight,
  interactive = false,
  onImageError,
}: PhotoDetailClientProps) {
  const imageUrl = photo.imageUrl
  const fullResUrl = photo.fullResUrl
  const detections = photo.detections
  const showDetections = photo.detectionStatus === "completed"

  const { hoveredDetectionId, setHoveredDetectionId, pinnedDetectionId, setPinnedDetectionId } =
    useDetectionHover()

  const tapStartRef = useRef<{ x: number; y: number } | null>(null)
  const { openPanel, isOpen: isEditPanelOpen } = useDetectionEdit()
  const containerRef = useRef<HTMLDivElement>(null)
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 0, height: 0 })
  const imageBounds = useObjectContainBounds({
    containerRef,
    naturalWidth: naturalDimensions.width,
    naturalHeight: naturalDimensions.height,
  })
  const { showBoundingBoxes, toggleBoundingBoxes } = useUIStore()
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  const handleDetectionClick = useCallback((detectionId: string) => {
    if (!interactive) return
    if (pinnedDetectionId === detectionId) {
      openPanel(detectionId)
    } else {
      setPinnedDetectionId(detectionId)
    }
  }, [interactive, pinnedDetectionId, setPinnedDetectionId, openPanel])

  useEffect(() => {
    if (!interactive || pinnedDetectionId === null || isEditPanelOpen) return
    const clear = () => setPinnedDetectionId(null)
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest("[data-detection-interactive]")) return
      clear()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear()
    }
    document.addEventListener("click", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("click", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [interactive, pinnedDetectionId, isEditPanelOpen, setPinnedDetectionId])

  return (
    <div className="relative">
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
                  priority={interactive}
                  placeholder="blur"
                  blurDataURL={BLUR_DATA_URL}
                  onError={() => onImageError?.()}
                  onLoad={(e) => {
                    const img = e.currentTarget as HTMLImageElement
                    setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight })
                  }}
                />

                {/* Tap-to-zoom (centered/interactive slide only). Horizontal swipe is
                    handled by the parent PhotoPager. */}
                {interactive && (
                  <div
                    className="absolute inset-0 z-10 md:hidden"
                    onTouchStart={(e) => {
                      const t = e.touches[0]
                      tapStartRef.current = t ? { x: t.clientX, y: t.clientY } : null
                    }}
                    onTouchEnd={(e) => {
                      const t = e.changedTouches[0]
                      const s = tapStartRef.current
                      tapStartRef.current = null
                      if (s && t && Math.abs(t.clientX - s.x) < 10 && Math.abs(t.clientY - s.y) < 10) {
                        setIsLightboxOpen(true)
                      }
                    }}
                    role="button"
                    aria-label="Tap to zoom"
                  />
                )}

                <DetectionOverlay
                  detections={detections}
                  imageWidth={imageWidth}
                  imageHeight={imageHeight}
                  visible={showDetections}
                  showAll={showBoundingBoxes}
                  showPins
                  hoveredDetectionId={hoveredDetectionId}
                  pinnedDetectionId={pinnedDetectionId}
                  onDetectionClick={handleDetectionClick}
                  onDetectionHover={setHoveredDetectionId}
                  imageBounds={imageBounds.ready ? imageBounds : undefined}
                />

                {interactive && (
                  <div className="absolute top-2 right-2 md:top-3 md:right-3 z-50 flex gap-1.5 md:gap-2">
                    {detections.length > 0 && (
                      <button
                        onClick={toggleBoundingBoxes}
                        className="p-2 md:px-3 md:py-1.5 bg-slate-deep/90 hover:bg-slate-deep text-cream text-sm font-medium rounded-md border border-cream/20 backdrop-blur-sm transition-colors"
                        aria-label={showBoundingBoxes ? "Hide detection boxes" : "Show detection boxes"}
                      >
                        {showBoundingBoxes ? (
                          <><EyeOff className="h-4 w-4 md:hidden" /><span className="hidden md:inline">Hide Boxes</span></>
                        ) : (
                          <><Eye className="h-4 w-4 md:hidden" /><span className="hidden md:inline">Show Boxes</span></>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => setIsLightboxOpen(true)}
                      className="p-2 md:px-3 md:py-1.5 bg-slate-deep/90 hover:bg-slate-deep text-cream text-sm font-medium rounded-md border border-cream/20 backdrop-blur-sm transition-colors"
                      aria-label="Zoom in on photo"
                    >
                      <ZoomIn className="h-4 w-4 md:hidden" /><span className="hidden md:inline">Zoom</span>
                    </button>
                  </div>
                )}
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

      {interactive && imageUrl && (
        <PhotoLightbox
          imageUrl={fullResUrl ?? imageUrl}
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
        />
      )}
    </div>
  )
}
