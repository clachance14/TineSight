import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-copper text-slate-deep hover:bg-copper-light",
        secondary:
          "border-transparent bg-slate-700 text-cream hover:bg-slate-600",
        destructive:
          "border-transparent bg-red-500 text-cream hover:bg-red-600",
        outline: "text-cream-dark border-slate-600",
        success:
          "border-transparent bg-green-600 text-cream hover:bg-green-700",
        warning:
          "border-transparent bg-yellow-600 text-slate-deep hover:bg-yellow-700",
        processing:
          "border-transparent bg-blue-600 text-cream hover:bg-blue-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
