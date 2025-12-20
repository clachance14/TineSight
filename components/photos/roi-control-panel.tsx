"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Save,
  Trash2,
  Star,
  RefreshCw,
  ThumbsDown,
  Loader2,
  CheckCircle,
  AlertCircle,
  HelpCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

type QualityStatus = "pending" | "high_quality" | "low_quality" | "manual_review"

interface ROIControlPanelProps {
  /**
   * Whether an ROI is currently drawn
   */
  hasROI: boolean
  /**
   * Whether the ROI has been saved to the database
   */
  isSaved: boolean
  /**
   * Whether the current ROI is marked as a reference
   */
  isReference: boolean
  /**
   * Current quality status of the detection
   */
  qualityStatus?: QualityStatus | null
  /**
   * Quality score (0-1)
   */
  qualityScore?: number | null
  /**
   * Number of reference ROIs the user has
   */
  referenceCount?: number
  /**
   * Minimum references required for quality scoring
   */
  minReferencesRequired?: number
  /**
   * Callback to save the ROI
   */
  onSave?: () => void
  /**
   * Callback to clear the ROI
   */
  onClear?: () => void
  /**
   * Callback to toggle reference status
   */
  onToggleReference?: () => void
  /**
   * Callback to regenerate embedding from ROI
   */
  onRegenerateEmbedding?: () => void
  /**
   * Callback to open feedback dialog
   */
  onOpenFeedback?: () => void
  /**
   * Whether save operation is in progress
   */
  isSaving?: boolean
  /**
   * Whether regeneration is in progress
   */
  isRegenerating?: boolean
  /**
   * Optional class name
   */
  className?: string
}

const QUALITY_STATUS_CONFIG: Record<
  QualityStatus,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  pending: {
    label: "Pending",
    color: "bg-slate-500",
    icon: HelpCircle,
  },
  high_quality: {
    label: "High Quality",
    color: "bg-green-500",
    icon: CheckCircle,
  },
  low_quality: {
    label: "Low Quality",
    color: "bg-red-500",
    icon: AlertCircle,
  },
  manual_review: {
    label: "Review Needed",
    color: "bg-amber-500",
    icon: AlertCircle,
  },
}

/**
 * Control panel for ROI selection and quality management.
 * Provides buttons for save, clear, reference toggle, and embedding regeneration.
 */
export function ROIControlPanel({
  hasROI,
  isSaved,
  isReference,
  qualityStatus,
  qualityScore,
  referenceCount = 0,
  minReferencesRequired = 3,
  onSave,
  onClear,
  onToggleReference,
  onRegenerateEmbedding,
  onOpenFeedback,
  isSaving = false,
  isRegenerating = false,
  className,
}: ROIControlPanelProps) {
  const statusConfig = qualityStatus
    ? QUALITY_STATUS_CONFIG[qualityStatus]
    : null
  const StatusIcon = statusConfig?.icon ?? HelpCircle

  const canRegenerateEmbedding = hasROI && isSaved && !isRegenerating
  const hasEnoughReferences = referenceCount >= minReferencesRequired

  return (
    <TooltipProvider>
      <div
        className={cn(
          "bg-slate-deep/90 backdrop-blur-sm rounded-lg p-4 space-y-4",
          className
        )}
      >
        {/* Quality Status Section */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-cream/80">Quality Status</h4>
          <div className="flex items-center gap-2">
            {statusConfig ? (
              <>
                <Badge
                  variant="secondary"
                  className={cn(
                    "gap-1",
                    statusConfig.color,
                    "text-white border-0"
                  )}
                >
                  <StatusIcon className="h-3 w-3" />
                  {statusConfig.label}
                </Badge>
                {qualityScore !== null && qualityScore !== undefined && (
                  <span className="text-xs text-cream/60">
                    Score: {(qualityScore * 100).toFixed(0)}%
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-cream/60">Not analyzed</span>
            )}
          </div>

          {/* Reference count info */}
          <div className="text-xs text-cream/60">
            {hasEnoughReferences ? (
              <span className="text-green-400">
                ✓ {referenceCount} reference ROIs (quality scoring active)
              </span>
            ) : (
              <span>
                {referenceCount}/{minReferencesRequired} reference ROIs needed
                for quality scoring
              </span>
            )}
          </div>
        </div>

        <Separator className="bg-cream/20" />

        {/* ROI Actions */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-cream/80">ROI Selection</h4>

          <div className="grid grid-cols-2 gap-2">
            {/* Save ROI */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onSave}
                  disabled={!hasROI || isSaving || isSaved}
                  className="w-full"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  {isSaved ? "Saved" : "Save"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Save the current ROI selection</p>
              </TooltipContent>
            </Tooltip>

            {/* Clear ROI */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClear}
                  disabled={!hasROI && !isSaved}
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clear the ROI selection</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Reference Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isReference ? "default" : "outline"}
                size="sm"
                onClick={onToggleReference}
                disabled={!isSaved}
                className={cn(
                  "w-full",
                  isReference &&
                    "bg-amber-500 hover:bg-amber-600 text-slate-900"
                )}
              >
                <Star
                  className={cn(
                    "h-4 w-4 mr-1",
                    isReference && "fill-current"
                  )}
                />
                {isReference ? "Reference ROI" : "Mark as Reference"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {isReference
                  ? "This ROI is used as a quality reference"
                  : "Mark this as a high-quality reference for scoring other detections"}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator className="bg-cream/20" />

        {/* Embedding Actions */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-cream/80">
            Embedding Actions
          </h4>

          {/* Regenerate Embedding */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                onClick={onRegenerateEmbedding}
                disabled={!canRegenerateEmbedding}
                className="w-full bg-copper hover:bg-copper-light"
              >
                {isRegenerating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                {isRegenerating ? "Regenerating..." : "Regenerate Embedding"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Generate a new embedding using only the selected ROI region
              </p>
            </TooltipContent>
          </Tooltip>

          {/* Submit Feedback (for low quality) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenFeedback}
                className="w-full text-red-400 border-red-400/50 hover:bg-red-400/10"
              >
                <ThumbsDown className="h-4 w-4 mr-1" />
                Report Issue
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Report quality issues with this detection</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Help text */}
        <div className="text-xs text-cream/50 pt-2">
          <p>
            Draw a box around the deer&apos;s head and antlers for best matching
            results.
          </p>
        </div>
      </div>
    </TooltipProvider>
  )
}
