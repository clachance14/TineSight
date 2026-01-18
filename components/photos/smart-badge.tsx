"use client"

import type { ReactElement } from "react"
import { Loader2, Clock, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface SmartBadgeProps {
  status: string
  iconOnly?: boolean | undefined
  className?: string | undefined
}

const statusConfig = {
  processing: {
    icon: Loader2,
    label: "Processing",
    colors: "bg-blue-500/20 text-blue-400",
    animate: true,
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    colors: "bg-red-500/20 text-red-400",
    animate: false,
  },
  pending: {
    icon: Clock,
    label: "Pending",
    colors: "bg-yellow-500/20 text-yellow-400",
    animate: false,
  },
} as const

type StatusKey = keyof typeof statusConfig

export function SmartBadge({ status, iconOnly = false, className }: SmartBadgeProps): ReactElement | null {
  // Hide completed status (assumed default)
  if (status === "completed") {
    return null
  }

  // Only handle known status keys
  if (!(status in statusConfig)) {
    return null
  }

  const config = statusConfig[status as StatusKey]
  const Icon = config.icon

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full text-xs font-medium",
        "px-1.5 py-0.5",
        config.colors,
        className
      )}
    >
      <Icon
        className={cn(
          "h-3 w-3",
          config.animate && "animate-spin"
        )}
      />
      {!iconOnly && (
        <span className="sr-only sm:not-sr-only">{config.label}</span>
      )}
    </div>
  )
}
