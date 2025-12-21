"use client"

import * as React from "react"
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
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface DeerOption {
  id: string
  name: string
}

interface NamedDeerDropdownProps {
  deerList: DeerOption[]
  value: string | null  // deer ID or null for all
  onChange: (deerId: string | null) => void
}

export function NamedDeerDropdown({ deerList, value, onChange }: NamedDeerDropdownProps) {
  const [open, setOpen] = React.useState(false)

  // Find selected deer name
  const selectedDeer = deerList.find(deer => deer.id === value)
  const displayLabel = selectedDeer ? selectedDeer.name : "Named"

  const handleSelect = (deerId: string | null) => {
    onChange(deerId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 text-xs gap-1.5 min-w-[120px] justify-between",
            value && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          {displayLabel}
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search deer..." />
          <CommandList>
            <CommandEmpty>No deer found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all"
                onSelect={() => handleSelect(null)}
              >
                All Deer
              </CommandItem>
              {deerList.map((deer) => (
                <CommandItem
                  key={deer.id}
                  value={deer.name}
                  onSelect={() => handleSelect(deer.id)}
                >
                  {deer.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
