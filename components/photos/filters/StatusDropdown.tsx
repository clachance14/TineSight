"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { AlertCircle, ChevronDown } from "lucide-react"

interface StatusDropdownProps {
  value: 'all' | 'pending' | 'processing' | 'completed' | 'failed'
  onChange: (value: 'all' | 'pending' | 'processing' | 'completed' | 'failed') => void
  failedCount?: number | undefined
}

const STATUS_LABELS = {
  all: 'Status',
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
} as const

export function StatusDropdown({ value, onChange, failedCount = 0 }: StatusDropdownProps) {
  const isActive = value !== 'all'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 text-xs border-slate-700 bg-slate-deep/50 text-cream-dark",
            "hover:bg-slate hover:border-slate-600 hover:text-cream",
            isActive && "border-copper bg-copper/10 text-copper hover:bg-copper/20 hover:border-copper-light"
          )}
        >
          {STATUS_LABELS[value]}
          <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[200px] border-slate-700 bg-slate text-cream"
      >
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as typeof value)}>
          <DropdownMenuRadioItem
            value="all"
            className="cursor-pointer text-xs text-cream-dark hover:bg-slate-deep hover:text-cream focus:bg-slate-deep focus:text-cream data-[state=checked]:text-copper"
          >
            All
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="pending"
            className="cursor-pointer text-xs text-cream-dark hover:bg-slate-deep hover:text-cream focus:bg-slate-deep focus:text-cream data-[state=checked]:text-copper"
          >
            Pending
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="processing"
            className="cursor-pointer text-xs text-cream-dark hover:bg-slate-deep hover:text-cream focus:bg-slate-deep focus:text-cream data-[state=checked]:text-copper"
          >
            Processing
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="completed"
            className="cursor-pointer text-xs text-cream-dark hover:bg-slate-deep hover:text-cream focus:bg-slate-deep focus:text-cream data-[state=checked]:text-copper"
          >
            Completed
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="failed"
            className="cursor-pointer text-xs text-cream-dark hover:bg-slate-deep hover:text-cream focus:bg-slate-deep focus:text-cream data-[state=checked]:text-copper"
          >
            <div className="flex items-center justify-between w-full">
              <span>Failed</span>
              {failedCount > 0 && (
                <span className="ml-2 flex items-center gap-1 text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  <span className="text-[10px] font-medium">{failedCount}</span>
                </span>
              )}
            </div>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
