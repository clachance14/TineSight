"use client"

interface CropLightboxProps {
  isOpen: boolean
  cropUrl?: string | null | undefined
  imageUrl?: string
  detection: {
    bboxX: number
    bboxY: number
    bboxWidth: number
    bboxHeight: number
  } | null
  imageWidth?: number
  imageHeight?: number
}

export function CropLightbox({
  isOpen,
  cropUrl,
  imageUrl,
  detection,
  imageWidth = 10000,
  imageHeight = 10000,
}: CropLightboxProps) {
  if (!isOpen || !detection) return null

  // Calculate CSS background-position crop style for fallback
  // bbox coordinates are center-based (YOLO format) on 0-10000 scale
  const centerXPct = (detection.bboxX / imageWidth) * 100
  const centerYPct = (detection.bboxY / imageHeight) * 100
  const widthPct = (detection.bboxWidth / imageWidth) * 100
  const heightPct = (detection.bboxHeight / imageHeight) * 100

  // Add 20% padding around bbox for context
  const padding = 0.20
  const regionWidthPct = widthPct * (1 + 2 * padding)
  const regionHeightPct = heightPct * (1 + 2 * padding)

  // Calculate background size to make region fill container
  // Use Math.min to ensure ENTIRE region fits (may have letterboxing)
  const bgSizeX = (100 / regionWidthPct) * 100
  const bgSizeY = (100 / regionHeightPct) * 100
  const bgSize = Math.min(bgSizeX, bgSizeY)
  const clampedBgSize = Math.min(bgSize, 2000)

  // Calculate background-position to center the bbox in the container
  // CSS background-position: X% Y% means position X% of image at X% of container
  // To center our detection region, we need to offset from 50%
  // based on how far the bbox center is from the image center
  const bgPosX = 50 + ((centerXPct - 50) * clampedBgSize / 100)
  const bgPosY = 50 + ((centerYPct - 50) * clampedBgSize / 100)

  const cropStyle: React.CSSProperties = {
    backgroundImage: `url(${imageUrl})`,
    backgroundSize: `${clampedBgSize}%`,
    backgroundPosition: `${bgPosX}% ${bgPosY}%`,
    backgroundRepeat: 'no-repeat',
  }

  return (
    <div className="fixed inset-0 right-[400px] z-[60] bg-black/95 flex items-center justify-center p-8">
      {cropUrl ? (
        <img
          src={cropUrl}
          alt="Detection crop"
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      ) : imageUrl ? (
        <div
          className="w-full h-full max-w-[800px] max-h-[600px] rounded-lg"
          style={cropStyle}
        />
      ) : null}
    </div>
  )
}
