import type { PhotoFilters, OtherAnimalType } from '@/lib/services/photos'
import { photoOrder, photoCursorPredicate } from '@/lib/photos/order'

const strings = ['batchId', 'uploadSessionId', 'cameraId', 'deerId', 'areaName', 'dateFrom', 'dateTo'] as const
const booleans = ['hasDeer', 'hasDetections', 'emptyOnly', 'isArchived', 'includeArchived'] as const
const numbers = ['minConfidence', 'minPoints', 'maxPoints', 'minScore'] as const
const enums = {
  datePreset: ['today', 'last7days', 'last30days', 'custom'],
  triageView: ['priority', 'all', 'trophy', 'buck', 'doe', 'other', 'empty', 'unprocessed', 'security'],
  reviewStatus: ['unreviewed', 'keep', 'review_later'],
  status: ['pending', 'processing', 'completed', 'failed'],
  qualityStatus: ['high_quality', 'manual_review', 'low_quality'],
  sex: ['buck', 'doe', 'fawn', 'unknown'],
  sizeClass: ['trophy', 'standard', 'basket', 'spike', 'unknown'],
  sortBy: ['captured_at', 'imported_at', 'best_score'],
  sortDirection: ['asc', 'desc'],
} as const
const animals: OtherAnimalType[] = ['hogs', 'cows', 'goats', 'people', 'vehicles']

/** One decoder for gallery links, detail navigation, list requests, and bulk selection. */
export function parsePhotoFilters(params: URLSearchParams): PhotoFilters {
  const filters: PhotoFilters = {}
  for (const key of strings) {
    const value = params.get(key)
    if (value !== null && value !== '') {
      if ((key === 'dateFrom' || key === 'dateTo') && Number.isNaN(Date.parse(value))) throw new Error(`Invalid ${key}`)
      filters[key] = value
    }
  }
  for (const key of booleans) {
    const value = params.get(key)
    if (value === null || value === '') continue
    if (value !== 'true' && value !== 'false') throw new Error(`Invalid ${key}`)
    filters[key] = value === 'true'
  }
  for (const key of numbers) {
    const value = params.get(key) ?? (key === 'minPoints' ? params.get('min_points') : key === 'maxPoints' ? params.get('max_points') : null)
    if (value === null || value === '') continue
    const number = Number(value)
    if (!Number.isSafeInteger(number) || number < 0 || (key === 'minConfidence' && number > 100)) throw new Error(`Invalid ${key}`)
    filters[key] = number
  }
  for (const key of Object.keys(enums) as Array<keyof typeof enums>) {
    const value = params.get(key)
    if (value === null || value === '' || (value === 'all' && key !== 'triageView')) continue
    if (!(enums[key] as readonly string[]).includes(value)) throw new Error(`Invalid ${key}`)
    Object.assign(filters, { [key]: value })
  }
  for (const key of ['areaNames', 'otherAnimals'] as const) {
    const raw = params.get(key)
    if (raw === null || raw === '') continue
    const parsed: unknown = raw.startsWith('[') ? JSON.parse(raw) : raw.split(',')
    if (!Array.isArray(parsed) || parsed.some(x => typeof x !== 'string')) throw new Error(`Invalid ${key}`)
    const values = (parsed as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
    if (key === 'otherAnimals') {
      if (values.some(x => !animals.includes(x as OtherAnimalType))) throw new Error('Invalid otherAnimals')
      if (values.length > 0) filters.otherAnimals = values as OtherAnimalType[]
    } else if (values.length > 0) filters.areaNames = values
  }
  if (filters.minPoints !== undefined && filters.maxPoints !== undefined && filters.minPoints > filters.maxPoints) throw new Error('Invalid point range')
  if (filters.dateFrom !== undefined && filters.dateTo !== undefined && Date.parse(filters.dateFrom) > Date.parse(filters.dateTo)) throw new Error('Invalid date range')
  const { field, ascending } = photoOrder(filters)
  filters.sortBy = field
  filters.sortDirection = ascending ? 'asc' : 'desc'
  const cursor = params.get('cursor')
  if (cursor !== null && cursor !== '') { photoCursorPredicate(field, ascending, cursor); filters.cursor = cursor }
  for (const key of ['limit', 'offset'] as const) {
    const raw = params.get(key)
    if (raw === null || raw === '') continue
    const value = Number(raw)
    if (!Number.isSafeInteger(value) || value < (key === 'limit' ? 1 : 0)) throw new Error(`Invalid ${key}`)
    filters[key] = key === 'limit' ? Math.min(value, 100) : value
  }
  return filters
}

/** Arrays use JSON so ranch area names containing commas round-trip losslessly. */
export function photoFilterParams(filters?: PhotoFilters, pagination = false): URLSearchParams {
  const params = new URLSearchParams()
  if (!filters) return params
  // JSON callers (bulk selection, saved views) reach the decoder through this
  // serializer, so a field of the wrong shape must be rejected here, exactly as the
  // URL path rejects it, rather than stringified or dropped into a wider selection.
  for (const key of [...strings, ...booleans, ...numbers, ...Object.keys(enums)] as Array<keyof PhotoFilters>) {
    const value: unknown = filters[key]
    if (value === undefined || value === null) continue
    if (typeof value === 'object') throw new Error(`Invalid ${key}`)
    if (value !== 'all' || key === 'triageView') params.set(key, String(value))
  }
  for (const key of ['areaNames', 'otherAnimals'] as const) {
    const value: unknown = filters[key]
    if (value === undefined || value === null) continue
    if (!Array.isArray(value)) throw new Error(`Invalid ${key}`)
    if (value.length > 0) params.set(key, JSON.stringify(value))
  }
  if (pagination) for (const key of ['limit', 'offset', 'cursor'] as const) {
    if (filters[key] !== undefined) params.set(key, String(filters[key]))
  }
  return params
}

/** Archive and review are orthogonal to content, source and date scope. */
export function withArchiveState(filters: PhotoFilters, value: string): PhotoFilters {
  const next = { ...filters }
  delete next.isArchived
  delete next.includeArchived
  if (value === 'archived') next.isArchived = true
  if (value === 'all') next.includeArchived = true
  return next
}
export function withReviewStatus(filters: PhotoFilters, value: string): PhotoFilters {
  const next = { ...filters }
  if (value === 'keep' || value === 'review_later' || value === 'unreviewed') next.reviewStatus = value
  else delete next.reviewStatus
  return next
}

/**
 * One single-valued select (camera, upload, analysis status, photo quality): the
 * empty option clears the field. An explicit analysis status hands scope to that
 * field, so a status-shaped triage view (Unprocessed) cannot contradict it.
 */
export type SourceFilterKey = 'cameraId' | 'uploadSessionId' | 'status' | 'qualityStatus'
export function withSourceField(filters: PhotoFilters, key: SourceFilterKey, value: string): PhotoFilters {
  const next = { ...filters }
  if (value !== '') next[key] = value
  else delete next[key]
  if (key === 'status') next.triageView = 'all'
  return next
}
