import type { OtherAnimalType, PhotoSortField, PhotoSortDirection } from '@/lib/services/photos'
import type { ViewFilters } from '@/lib/services/photo-view'

/**
 * Parse the full grid filter+sort set from URL search params into a ViewFilters
 * object. This is the single source of truth for decoding filters in the photo
 * detail page and any neighbor-prefetch API routes so that prev/next navigation
 * stays inside the exact filtered+sorted set the user came from.
 *
 * Array encoding mirrors the grid exactly:
 *   - areaNames  → single `areaNames` param, comma-separated  (e.g. "North,South")
 *   - otherAnimals → single `otherAnimals` param, comma-separated  (e.g. "hogs,cows")
 *
 * Keys are only set when the param is present and non-empty, satisfying
 * exactOptionalPropertyTypes (no key is ever explicitly set to `undefined`).
 */
export function parseDetailFilters(searchParams: URLSearchParams): ViewFilters {
  const f: ViewFilters = {}

  // --- Scalar string filters ---
  const status = searchParams.get('status')
  if (status !== null && status !== '') f.status = status

  const qualityStatus = searchParams.get('qualityStatus')
  if (qualityStatus !== null && qualityStatus !== '') f.qualityStatus = qualityStatus

  const sex = searchParams.get('sex')
  if (sex !== null && sex !== '') f.sex = sex

  const sizeClass = searchParams.get('sizeClass')
  if (sizeClass !== null && sizeClass !== '') f.sizeClass = sizeClass

  const cameraId = searchParams.get('cameraId')
  if (cameraId !== null && cameraId !== '') f.cameraId = cameraId

  const deerId = searchParams.get('deerId')
  if (deerId !== null && deerId !== '') f.deerId = deerId

  const dateFrom = searchParams.get('dateFrom')
  if (dateFrom !== null && dateFrom !== '') f.dateFrom = dateFrom

  const dateTo = searchParams.get('dateTo')
  if (dateTo !== null && dateTo !== '') f.dateTo = dateTo

  // --- Boolean filter ---
  const hasDeer = searchParams.get('hasDeer')
  if (hasDeer !== null && hasDeer !== '') f.hasDeer = hasDeer === 'true'

  // --- Integer filters ---
  const minConfidence = searchParams.get('minConfidence')
  if (minConfidence !== null && minConfidence !== '') {
    const parsed = parseInt(minConfidence, 10)
    if (!Number.isNaN(parsed)) f.minConfidence = parsed
  }

  const minPoints = searchParams.get('minPoints')
  if (minPoints !== null && minPoints !== '') {
    const parsed = parseInt(minPoints, 10)
    if (!Number.isNaN(parsed)) f.minPoints = parsed
  }

  const maxPoints = searchParams.get('maxPoints')
  if (maxPoints !== null && maxPoints !== '') {
    const parsed = parseInt(maxPoints, 10)
    if (!Number.isNaN(parsed)) f.maxPoints = parsed
  }

  const minScore = searchParams.get('minScore')
  if (minScore !== null && minScore !== '') {
    const parsed = parseInt(minScore, 10)
    if (!Number.isNaN(parsed)) f.minScore = parsed
  }

  // --- Array filters (comma-separated single param) ---
  // Mirrors grid: p.set('areaNames', f.areaNames.join(','))
  const areaNames = searchParams.get('areaNames')
  if (areaNames !== null && areaNames !== '') {
    f.areaNames = areaNames.split(',').filter(Boolean)
  }

  // Mirrors grid: p.set('otherAnimals', f.otherAnimals.join(','))
  const otherAnimals = searchParams.get('otherAnimals')
  if (otherAnimals !== null && otherAnimals !== '') {
    f.otherAnimals = otherAnimals.split(',').filter(Boolean) as OtherAnimalType[]
  }

  // --- Sort controls ---
  const sortBy = searchParams.get('sortBy')
  if (sortBy === 'best_score' || sortBy === 'captured_at' || sortBy === 'imported_at') {
    f.sortBy = sortBy as PhotoSortField
  }

  const sortDirection = searchParams.get('sortDirection')
  if (sortDirection === 'asc' || sortDirection === 'desc') {
    f.sortDirection = sortDirection as PhotoSortDirection
  }

  return f
}
