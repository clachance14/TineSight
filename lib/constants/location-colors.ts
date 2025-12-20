/**
 * Color palette for location pins on maps
 * Selected for high visibility against satellite imagery and terrain
 */

export const LOCATION_COLORS = [
  { value: '#3B82F6', label: 'Blue' },
  { value: '#EF4444', label: 'Red' },
  { value: '#22C55E', label: 'Green' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#14B8A6', label: 'Teal' },
  { value: '#F97316', label: 'Orange' },
  { value: '#06B6D4', label: 'Cyan' },
  { value: '#FACC15', label: 'Yellow' },
] as const

export type LocationColor = (typeof LOCATION_COLORS)[number]['value']

export const DEFAULT_LOCATION_COLOR = '#3B82F6'
