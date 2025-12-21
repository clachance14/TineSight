"use client"

import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"

interface RangeFilterProps {
  label: string
  min: number
  max: number
  value: [number, number]
  onChange: (value: [number, number]) => void
  step?: number
  formatValue?: (value: number) => string
}

export function RangeFilter({
  label,
  min,
  max,
  value,
  onChange,
  step = 1,
  formatValue = (v) => v.toString(),
}: RangeFilterProps) {
  const handleChange = (newValue: number[]) => {
    if (newValue.length === 2 && newValue[0] !== undefined && newValue[1] !== undefined) {
      onChange([newValue[0], newValue[1]])
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-cream">{label}</Label>
        <span className="text-xs text-cream-dark">
          {formatValue(value[0])} - {formatValue(value[1])}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={handleChange}
        className="py-4"
      />
    </div>
  )
}
