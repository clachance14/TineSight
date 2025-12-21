"use client";

import { useState } from "react";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface AreasDropdownProps {
  areas: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

const NO_AREA_KEY = "__no_area__";

export function AreasDropdown({ areas, selected, onChange }: AreasDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleToggle = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const isActive = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 text-xs gap-1.5",
            isActive && "border-copper bg-copper/10 text-copper hover:bg-copper/20"
          )}
        >
          <MapPin className="h-3.5 w-3.5" />
          {isActive ? `Areas (${selected.length})` : "Areas"}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search areas..." />
          <CommandList>
            <CommandEmpty>No areas found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => handleToggle(NO_AREA_KEY)}
                className="gap-2"
              >
                <Checkbox
                  checked={selected.includes(NO_AREA_KEY)}
                  onCheckedChange={() => handleToggle(NO_AREA_KEY)}
                />
                <span className="text-muted-foreground italic">No Area</span>
                {selected.includes(NO_AREA_KEY) && (
                  <Check className="ml-auto h-4 w-4" />
                )}
              </CommandItem>
              {areas.map((area) => (
                <CommandItem
                  key={area}
                  onSelect={() => handleToggle(area)}
                  className="gap-2"
                >
                  <Checkbox
                    checked={selected.includes(area)}
                    onCheckedChange={() => handleToggle(area)}
                  />
                  <span>{area}</span>
                  {selected.includes(area) && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
