import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Base styles
        "h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none md:text-sm",
        "transition-all duration-200",
        // Dark mode background
        "dark:bg-input/50 border-input",
        // Placeholder and text selection
        "placeholder:text-muted-foreground",
        "selection:bg-primary selection:text-primary-foreground",
        // Focus states - saddle brown ring for premium feel
        "focus-visible:border-saddle focus-visible:ring-saddle/30 focus-visible:ring-[3px]",
        "focus-visible:bg-input/70",
        // File input styles
        "file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        // Disabled states
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // Invalid states
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
