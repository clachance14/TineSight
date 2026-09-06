export interface PhotoZoom { scale: number; x: number; y: number }
export interface PhotoZoomBounds { width: number; height: number; imageWidth: number; imageHeight: number }
export const fitPhoto: PhotoZoom = { scale: 1, x: 0, y: 0 }

export function clampPhotoZoom(view: PhotoZoom, bounds: PhotoZoomBounds): PhotoZoom {
  const scale = Math.max(1, Math.min(5, view.scale))
  const maxX = Math.max(0, (bounds.imageWidth * scale - bounds.width) / 2)
  const maxY = Math.max(0, (bounds.imageHeight * scale - bounds.height) / 2)
  return { scale, x: maxX === 0 ? 0 : Math.max(-maxX, Math.min(maxX, view.x)), y: maxY === 0 ? 0 : Math.max(-maxY, Math.min(maxY, view.y)) }
}

/** Anchor coordinates are relative to the viewport center. */
export function zoomPhotoAt(view: PhotoZoom, scale: number, anchor: { x: number; y: number }, bounds: PhotoZoomBounds): PhotoZoom {
  const nextScale = Math.max(1, Math.min(5, scale))
  const ratio = nextScale / view.scale
  return clampPhotoZoom({ scale: nextScale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio }, bounds)
}
