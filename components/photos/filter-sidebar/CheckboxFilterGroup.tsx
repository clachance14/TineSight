"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

interface CheckboxFilterGroupProps {
  label: string
  options: Array<{
    value: string
    label: string
    count?: number
  }>
  selected: string[]
  onSelectionChange: (values: string[]) => void
  multiSelect?: boolean // default true
}

export function CheckboxFilterGroup({
  label,
  options,
  selected,
  onSelectionChange,
  multiSelect = true,
}: CheckboxFilterGroupProps) {
  const handleToggle = (value: string) => {
    if (multiSelect) {
      const newSelected = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
      onSelectionChange(newSelected)
    } else {
      // Single select mode
      onSelectionChange(selected.includes(value) ? [] : [value])
    }
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-cream">{label}</Label>
      <div className="space-y-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value)
          return (
            <div
              key={option.value}
              className="flex items-center space-x-2 group"
            >
              <Checkbox
                id={`${label}-${option.value}`}
                checked={isSelected}
                onCheckedChange={() => handleToggle(option.value)}
                className="border-cream/20 data-[state=checked]:bg-copper data-[state=checked]:border-copper"
              />
              <label
                htmlFor={`${label}-${option.value}`}
                className={`flex-1 text-sm cursor-pointer transition-colors ${
                  isSelected
                    ? "text-cream font-medium"
                    : "text-cream-dark group-hover:text-cream"
                }`}
              >
                {option.label}
                {option.count !== undefined && (
                  <span className="ml-1.5 text-cream-dark/60">
                    ({option.count})
                  </span>
                )}
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
