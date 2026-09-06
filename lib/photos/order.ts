/** The gallery, keyset pagination, and viewer use exactly the same tuple order. */
export type OrderedPhotoField = 'captured_at' | 'imported_at' | 'best_score'
export function photoOrder(filters?: { sortBy?: string; sortDirection?: string }): { field: OrderedPhotoField; ascending: boolean } {
  const field: OrderedPhotoField = filters?.sortBy === 'imported_at' || filters?.sortBy === 'best_score'
    ? filters.sortBy : 'captured_at'
  return { field, ascending: filters?.sortDirection === 'asc' }
}

export function encodePhotoCursor(photo: { id: string; captured_at: string | null; imported_at: string; best_score: number | null }, field: OrderedPhotoField): string {
  return `${photo[field] ?? 'null'}::${photo.id}`
}

/** Strictly validate before interpolating any cursor into PostgREST's logic syntax. */
export function photoCursorPredicate(field: OrderedPhotoField, ascending: boolean, cursor: string, side: 'after' | 'before' = 'after'): string {
  const parts = cursor.split('::')
  const value = parts[0]
  const id = parts[1]
  if (parts.length !== 2 || id === undefined || id === '' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || value === undefined || value === '') {
    throw new Error('Invalid photo cursor')
  }
  if (value !== 'null' && (field === 'best_score'
    ? !/^\d+(?:\.\d+)?$/.test(value)
    : !/^[0-9T:.+Z-]+$/.test(value) || Number.isNaN(Date.parse(value)))) {
    throw new Error('Invalid photo cursor')
  }
  const after = side === 'after'
  const comparison = ascending === after ? 'gt' : 'lt'
  if (value === 'null') {
    const sameNull = `and(${field}.is.null,id.${comparison}.${id})`
    return after ? sameNull : `${field}.not.is.null,${sameNull}`
  }
  const tuple = `${field}.${comparison}.${value},and(${field}.eq.${value},id.${comparison}.${id})`
  // NULLS LAST is independent of direction. Cross into that tail only when moving forward.
  return after ? `${tuple},${field}.is.null` : tuple
}
