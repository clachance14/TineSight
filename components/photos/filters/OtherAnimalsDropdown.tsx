'use client'

import { ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandList,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export type OtherAnimalType = 'hogs' | 'cows' | 'goats' | 'people' | 'vehicles'

interface OtherAnimalsDropdownProps {
  selected: OtherAnimalType[]
  onChange: (selected: OtherAnimalType[]) => void
}

const OTHER_ANIMAL_OPTIONS: { value: OtherAnimalType; label: string }[] = [
  { value: 'hogs', label: 'Hogs' },
  { value: 'cows', label: 'Cows' },
  { value: 'goats', label: 'Goats' },
  { value: 'people', label: 'People' },
  { value: 'vehicles', label: 'Vehicles' },
]

export function OtherAnimalsDropdown({
  selected,
  onChange,
}: OtherAnimalsDropdownProps) {
  const handleToggle = (value: OtherAnimalType) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value]
    onChange(newSelected)
  }

  const isActive = selected.length > 0
  const buttonLabel = isActive ? `Other (${selected.length})` : 'Other'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 text-xs border-slate-600 bg-slate hover:bg-slate-700',
            isActive && 'border-copper bg-copper/10 text-copper hover:bg-copper/20'
          )}
        >
          {buttonLabel}
          <ChevronDown className="ml-2 h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[200px] p-0 bg-slate border-slate-600"
        align="start"
      >
        <Command className="bg-slate">
          <CommandList>
            <CommandEmpty className="py-6 text-center text-sm text-cream-dark">
              No options found.
            </CommandEmpty>
            {OTHER_ANIMAL_OPTIONS.map((option) => {
              const isSelected = selected.includes(option.value)
              return (
                <CommandItem
                  key={option.value}
                  onSelect={() => handleToggle(option.value)}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-700 aria-selected:bg-slate-700"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => handleToggle(option.value)}
                    className={cn(
                      'border-slate-500',
                      isSelected && 'bg-copper border-copper'
                    )}
                  />
                  <span className="text-sm text-cream">{option.label}</span>
                  {isSelected && (
                    <Check className="ml-auto h-4 w-4 text-copper" />
                  )}
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
