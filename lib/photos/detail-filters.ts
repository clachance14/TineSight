import type { ViewFilters } from '@/lib/services/photo-view'
import { parsePhotoFilters } from '@/lib/photos/filters'

export function parseDetailFilters(searchParams: URLSearchParams): ViewFilters {
  const { cursor: _cursor, limit: _limit, offset: _offset, ...filters } = parsePhotoFilters(searchParams)
  return filters
}
