"use client"

import type { ReactElement } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export function UploadFab(): ReactElement {
  return (
    <Link
      href="/upload"
      className={cn(
        'fixed bottom-20 right-4 z-50',
        'flex items-center justify-center',
        'w-14 h-14 rounded-full',
        'bg-copper hover:bg-copper-light',
        'shadow-lg shadow-black/20',
        'transition-colors duration-200',
        'md:hidden',
        'active:scale-95'
      )}
      aria-label="Upload photos"
    >
      <Plus className="w-6 h-6 text-slate-deep" />
    </Link>
  )
}
