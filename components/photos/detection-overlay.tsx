"use client"

import { cn } from "@/lib/utils"

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
  }>
  imageWidth: number
  imageHeight: number
  visible?: boolean
  onDetectionClick?: (detectionId: string) => void
}

export function DetectionOverlay({
  detections,
  imageWidth,
  imageHeight,
  visible = true,
  onDetectionClick,
}: DetectionOverlayProps) {
  if (!visible || imageWidth === 0 || imageHeight === 0) {
    return null
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {detections.map((detection) => {
        const left = (detection.bboxX / imageWidth) * 100
        const top = (detection.bboxY / imageHeight) * 100
        const width = (detection.bboxWidth / imageWidth) * 100
        const height = (detection.bboxHeight / imageHeight) * 100

        const isDeer = detection.class === "deer"
        const isLinkedToDeer = !!detection.deerId

        // Color logic: copper for linked deer, green for unlinked deer, blue for other animals
        const borderColor = isLinkedToDeer
          ? "border-copper"
          : isDeer
          ? "border-green-500"
          : "border-blue-500"

        const bgColor = isLinkedToDeer
          ? "bg-copper/10"
          : isDeer
          ? "bg-green-500/10"
          : "bg-blue-500/10"

        const hoverBgColor = isLinkedToDeer
          ? "hover:bg-copper/20"
          : isDeer
          ? "hover:bg-green-500/20"
          : "hover:bg-blue-500/20"

        const badgeBgColor = isLinkedToDeer
          ? "bg-copper"
          : isDeer
          ? "bg-green-500"
          : "bg-blue-500"

        return (
          <div
            key={detection.id}
            className={cn(
              "absolute border-2 rounded transition-all duration-200",
              borderColor,
              bgColor,
              onDetectionClick && "pointer-events-auto cursor-pointer",
              onDetectionClick && hoverBgColor
            )}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
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

            {/* Deer ID badge (if linked) */}
            {detection.deerId && (
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-xs font-medium bg-slate-deep/80 text-cream">
                Deer #{detection.deerId.slice(0, 6)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
