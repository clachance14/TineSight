"use client"

import { useState, useCallback, useRef, useEffect, type JSX } from "react"
import Image from "next/image"
import { ImageOff, Eye, EyeOff } from "lucide-react"
import { DetectionOverlay } from "./detection-overlay"
import { usePhotoZoom } from "@/lib/hooks/use-photo-zoom"
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
  /** Only the centered slide handles zoom, pan and detection editing. */
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
}: PhotoDetailClientProps): JSX.Element {
  const imageUrl = photo.imageUrl
  const detections = photo.detections
  const showDetections = photo.detectionStatus === "completed"

  const { hoveredDetectionId, setHoveredDetectionId, pinnedDetectionId, setPinnedDetectionId } =
    useDetectionHover()

  const { openPanel, isOpen: isEditPanelOpen } = useDetectionEdit()
  const containerRef = useRef<HTMLDivElement>(null)
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 0, height: 0 })
  const imageBounds = useObjectContainBounds({
    containerRef,
    naturalWidth: naturalDimensions.width,
    naturalHeight: naturalDimensions.height,
  })
  const { showBoundingBoxes, toggleBoundingBoxes } = useUIStore()
  const { view, handlers } = usePhotoZoom(containerRef, imageBounds, interactive && imageUrl !== null && imageUrl !== "")

  const handleDetectionClick = useCallback((detectionId: string) => {
    if (!interactive) return
    setPinnedDetectionId(detectionId)
    openPanel(detectionId)
  }, [interactive, setPinnedDetectionId, openPanel])

  useEffect(() => {
    if (!interactive || pinnedDetectionId === null || isEditPanelOpen) return
    const clear = (): void => setPinnedDetectionId(null)
    const onClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (target?.closest("[data-detection-interactive]")) return
      clear()
    }
    const onKey = (e: KeyboardEvent): void => {
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

          <div
            ref={containerRef}
            {...handlers}
            data-photo-viewport
            data-zoom-scale={view.scale}
            tabIndex={interactive ? 0 : undefined}
            role="region"
            aria-label="Photo. Scroll or pinch to zoom; drag to pan. Plus and minus zoom, arrow keys pan, Escape resets."
            style={{ touchAction: interactive ? 'none' : undefined, cursor: view.scale > 1 ? 'grab' : 'default' }}
            className="relative h-[min(58dvh,560px)] min-h-48 w-full overflow-hidden rounded-lg bg-slate-deep outline-none focus-visible:ring-2 focus-visible:ring-brass md:h-[calc(100dvh-176px)]"
          >
            {imageUrl !== null && imageUrl !== '' ? (
              <>
                <div data-photo-transform className="absolute inset-0 origin-center" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
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

                </div>

                {interactive && (
                  <div data-photo-control className="absolute top-2 right-2 md:top-3 md:right-3 z-50 flex gap-1.5 md:gap-2">
                    {detections.length > 0 && (
                      <button
                        onClick={toggleBoundingBoxes}
                        className="min-h-11 min-w-11 p-2 md:px-3 md:py-1.5 bg-slate-deep/90 hover:bg-slate-deep text-cream text-sm font-medium rounded-md border border-cream/20 backdrop-blur-sm transition-colors"
                        aria-label={showBoundingBoxes ? "Hide detection boxes" : "Show detection boxes"}
                      >
                        {showBoundingBoxes ? (
                          <><EyeOff className="h-4 w-4 md:hidden" /><span className="hidden md:inline">Hide Boxes</span></>
                        ) : (
                          <><Eye className="h-4 w-4 md:hidden" /><span className="hidden md:inline">Show Boxes</span></>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-cream-dark">
                <ImageOff className="size-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">{photo.variantStatus === 'failed' ? 'Preview unavailable' : 'Preview preparing'}</p>
                <p className="max-w-md px-4 text-center text-sm opacity-75">{photo.previewFailureReason ?? (photo.variantStatus === 'failed' ? 'Preview generation could not finish.' : 'A smaller preview is being prepared.')}</p>
              </div>
            )}
            {(typeof photo.analysisFailureReason === 'string' || (imageUrl !== null && typeof photo.previewFailureReason === 'string')) && (
              <div role="status" className="absolute inset-x-3 bottom-3 z-40 rounded-md border border-amber-400/30 bg-slate-deep/95 p-3 text-sm text-cream shadow-lg">
                {typeof photo.analysisFailureReason === 'string' && <p><strong>Analysis failed. </strong>{photo.analysisFailureReason}</p>}
                {imageUrl !== null && typeof photo.previewFailureReason === 'string' && <p><strong>Preview incomplete. </strong>{photo.previewFailureReason}</p>}
              </div>
            )}
          </div>


      {interactive && imageUrl !== null && imageUrl !== '' && (
        <p className="mt-2 text-xs text-weathered">
          <span className="font-mono">{Math.round(view.scale * 100)}%</span>
          <span className="hidden md:inline"> · Scroll to zoom · Drag to pan · Double-click to reset</span>
          <span className="md:hidden"> · Pinch to zoom · Drag to pan · Double-tap to reset</span>
        </p>
      )}
    </div>
  )
}
