import 'server-only'
import { photoFailureReason } from '@/lib/photos/failure-reason'
import { getPhoto, getSignedViewUrl, getAdjacentPhotos, type PhotoFilters } from '@/lib/services/photos'
import type { Detection } from '@/types/database'

export interface PhotoViewDetection {
  id: string
  bboxX: number
  bboxY: number
  bboxWidth: number
  bboxHeight: number
  confidence: number
  class: string | null
  deerId: string | null
  deerName: string | null
  qualityStatus: string | null
  qualityScore: number | null
  species: string | null
  sex: string | null
  sizeClass: string | null
  estimatedPointRange: string | null
  ageClass: string | null
}

export interface PhotoViewDTO {
  id: string
  imageUrl: string | null
  fullResUrl: string | null
  detections: PhotoViewDetection[]
  detectionStatus: string
  variantStatus: string
  analysisFailureReason: string | null
  previewFailureReason: string | null
  classification: string | null
  confidence: number | null
  capturedAt: string | null
  importedAt: string
  fileSizeBytes: number | null
  prevId: string | null
  nextId: string | null
  /** Epoch ms when the signed URLs go stale (~55 min). Pager refreshes past this. */
  expiresAt: number
}

export type ViewFilters = Omit<PhotoFilters, 'limit' | 'offset' | 'cursor'>

/**
 * Load the full view payload for one photo: signed image URLs, normalized
 * detections, prev/next ids over the (optionally filtered) ordering. Shared by
 * the detail page (initial render) and the /view route (neighbor prefetch).
 * Returns null when the photo is missing or not the caller's.
 */
export async function loadPhotoView(
  userId: string,
  id: string,
  filters?: ViewFilters,
): Promise<PhotoViewDTO | null> {
  const hasFilters = filters != null && Object.keys(filters).length > 0
  const [photoResult, adjacent] = await Promise.all([
    getPhoto(userId, id),
    getAdjacentPhotos(userId, id, hasFilters ? filters : undefined),
  ])
  const photo = photoResult.data
  if (photoResult.error || !photo) return null

  const [fullResResult, mediumResult] = await Promise.all([
    getSignedViewUrl(photo.file_path),
    photo.medium_path != null && photo.medium_path !== ''
      ? getSignedViewUrl(photo.medium_path)
      : Promise.resolve({ data: null, error: null }),
  ])
  const fullResUrl = fullResResult.data
  const imageUrl = mediumResult.data

  const detections = (photo.detections as Array<Detection & {
    quality_status?: string | null
    quality_score?: number | null
    species?: string | null
    sex?: string | null
    size_class?: string | null
    estimated_point_range?: string | null
    age_class?: string | null
    deer?: { id: string; name: string | null } | null
  }>)
    .map((d) => ({
      id: d.id,
      bboxX: d.bbox_x ?? 0,
      bboxY: d.bbox_y ?? 0,
      bboxWidth: d.bbox_width ?? 0,
      bboxHeight: d.bbox_height ?? 0,
      confidence: d.confidence ?? 0,
      class: d.class,
      deerId: d.deer_id,
      deerName: d.deer?.name ?? null,
      qualityStatus: d.quality_status ?? null,
      qualityScore: d.quality_score ?? null,
      species: d.species ?? null,
      sex: d.sex ?? null,
      sizeClass: d.size_class ?? null,
      estimatedPointRange: d.estimated_point_range ?? null,
      ageClass: d.age_class ?? null,
    }))
    .sort((a, b) => b.confidence - a.confidence)

  return {
    id: photo.id,
    imageUrl: imageUrl ?? null,
    fullResUrl: fullResUrl ?? null,
    detections,
    detectionStatus: photo.detection_status,
    variantStatus: photo.variant_status,
    analysisFailureReason: photoFailureReason('analysis', photo.detection_status, photo.error_message),
    previewFailureReason: photoFailureReason('preview', photo.variant_status, photo.variant_error),
    classification: photo.classification,
    confidence: photo.confidence,
    capturedAt: photo.captured_at,
    importedAt: photo.imported_at,
    fileSizeBytes: photo.file_size_bytes,
    prevId: adjacent.prevId,
    nextId: adjacent.nextId,
    expiresAt: Date.now() + 55 * 60_000,
  }
}
