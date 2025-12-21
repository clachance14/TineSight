"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"

interface SearchableSelectProps {
  label: string
  placeholder: string
  options: Array<{
    value: string
    label: string
    count?: number
  }>
  value: string | null
  onChange: (value: string | null) => void
}

export function SearchableSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)

  const selectedOption = options.find((option) => option.value === value)

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue === value ? null : selectedValue)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-cream">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-slate border-cream/20 text-cream hover:bg-slate/80 hover:text-cream"
          >
            <span className="truncate">
              {selectedOption ? (
                <>
                  {selectedOption.label}
                  {selectedOption.count !== undefined && (
                    <span className="ml-1.5 text-cream-dark/60">
                      ({selectedOption.count})
                    </span>
                  )}
                </>
              ) : (
                <span className="text-cream-dark">{placeholder}</span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {value && (
                <X
                  className="h-4 w-4 shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                  onClick={handleClear}
                />
              )}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-slate border-cream/20">
          <Command className="bg-slate">
            <CommandInput
              placeholder={`Search ${label.toLowerCase()}...`}
              className="text-cream placeholder:text-cream-dark/50"
            />
            <CommandList>
              <CommandEmpty className="text-cream-dark text-sm py-6 text-center">
                No results found.
              </CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={handleSelect}
                    className="text-cream hover:bg-slate-deep cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100 text-copper" : "opacity-0"
                      )}
                    />
                    <span className="flex-1">
                      {option.label}
                      {option.count !== undefined && (
                        <span className="ml-1.5 text-cream-dark/60">
                          ({option.count})
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
