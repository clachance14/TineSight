export interface DeerPreviewBox { bboxX: number | null; bboxY: number | null; bboxWidth: number | null; bboxHeight: number | null }

/** Fit the selected YOLO region, plus context, using the photo's real aspect ratio. */
export function deerPreviewFrame(box: DeerPreviewBox, imageWidth: number, imageHeight: number, width: number, height: number): { width: number; height: number; left: number; top: number } | null {
  const { bboxX: x, bboxY: y, bboxWidth: w, bboxHeight: h } = box
  if (x === null || y === null || w === null || h === null || ![x,y,w,h,imageWidth,imageHeight,width,height].every(Number.isFinite) || w <= 0 || h <= 0 || imageWidth <= 0 || imageHeight <= 0 || width <= 0 || height <= 0) return null
  const left = Math.max(0, (x - w * .7) / 10000) * imageWidth
  const right = Math.min(1, (x + w * .7) / 10000) * imageWidth
  const top = Math.max(0, (y - h * .7) / 10000) * imageHeight
  const bottom = Math.min(1, (y + h * .7) / 10000) * imageHeight
  if (right <= left || bottom <= top) return null
  const scale = Math.min(width / (right - left), height / (bottom - top))
  return { width: imageWidth * scale, height: imageHeight * scale, left: width / 2 - (left + right) / 2 * scale, top: height / 2 - (top + bottom) / 2 * scale }
}
