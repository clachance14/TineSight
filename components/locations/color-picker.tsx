'use client'

import { cn } from '@/lib/utils'
import { LOCATION_COLORS } from '@/lib/constants/location-colors'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  disabled?: boolean
}

export function ColorPicker({ value, onChange, disabled }: ColorPickerProps): React.ReactElement {
  return (
    <div className="grid grid-cols-5 gap-2">
      {LOCATION_COLORS.map(({ value: colorValue, label }) => (
        <button
          key={colorValue}
          type="button"
          disabled={disabled}
          onClick={() => onChange(colorValue)}
          className={cn(
            'w-11 h-11 rounded-full border-2 transition-all',
            'focus:outline-none focus:ring-2 focus:ring-copper focus:ring-offset-2 focus:ring-offset-slate-deep',
            value === colorValue
              ? 'border-cream ring-2 ring-copper scale-110'
              : 'border-transparent hover:scale-105',
            disabled === true && 'opacity-50 cursor-not-allowed'
          )}
          style={{ backgroundColor: colorValue }}
          aria-pressed={value === colorValue}
          title={label}
          aria-label={`Select ${label} color`}
        />
      ))}
    </div>
  )
}
