/** UI dates are local calendar days; URLs carry instants so shared views stay exact. */
export function dateInputValue(value?: string): string {
  if (value === undefined || value === '') return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function localDateBoundary(value: string, end = false): string {
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) throw new Error('Invalid calendar date')
  const date = new Date(year, month - 1, day)
  if (end) date.setHours(23, 59, 59, 999)
  return date.toISOString()
}

export type RelativeDatePreset = 'today' | 'last7days' | 'last30days'

export function relativeDateRange(preset: RelativeDatePreset, now = new Date()): { dateFrom: string; dateTo: string } {
  const end = new Date(now)
  const start = new Date(now)
  start.setDate(start.getDate() - (preset === 'last7days' ? 6 : preset === 'last30days' ? 29 : 0))
  return { dateFrom: localDateBoundary(dateInputValue(start.toISOString())), dateTo: localDateBoundary(dateInputValue(end.toISOString()), true) }
}
