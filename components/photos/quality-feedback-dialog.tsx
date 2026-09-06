"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type FeedbackType =
  | "distant"
  | "partial_view"
  | "no_antlers"
  | "obstructed"
  | "wrong_angle"
  | "blurry"
  | "other"

interface FeedbackOption {
  value: FeedbackType
  label: string
  description: string
}

const FEEDBACK_OPTIONS: FeedbackOption[] = [
  {
    value: "distant",
    label: "Too Distant",
    description: "Animal is too far away for reliable identification",
  },
  {
    value: "partial_view",
    label: "Partial View",
    description: "Only part of the animal is visible in frame",
  },
  {
    value: "no_antlers",
    label: "No Antlers Visible",
    description: "Antlers are not visible or animal has no antlers",
  },
  {
    value: "obstructed",
    label: "Obstructed",
    description: "Vegetation or objects blocking the view",
  },
  {
    value: "wrong_angle",
    label: "Wrong Angle",
    description: "Camera angle doesn't show identifiable features",
  },
  {
    value: "blurry",
    label: "Blurry Image",
    description: "Image is too blurry for identification",
  },
  {
    value: "other",
    label: "Other",
    description: "Other issue not listed above",
  },
]

interface QualityFeedbackDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean
  /**
   * Callback when dialog open state changes
   */
  onOpenChange: (open: boolean) => void
  /**
   * Detection ID for the feedback (unused but kept for API consistency)
   */
  detectionId: string
  /**
   * Callback when feedback is submitted
   */
  onSubmit: (feedbackType: FeedbackType, notes: string | null) => Promise<void>
  /**
   * Whether submission is in progress
   */
  isSubmitting?: boolean
}

/**
 * Dialog for submitting quality feedback on a detection.
 * Users can select a feedback type and optionally add notes.
 */
export function QualityFeedbackDialog({
  open,
  onOpenChange,
  detectionId: _detectionId,
  onSubmit,
  isSubmitting = false,
}: QualityFeedbackDialogProps) {
  // detectionId is passed for API consistency but handled by parent
  const [selectedType, setSelectedType] = useState<FeedbackType | null>(null)
  const [notes, setNotes] = useState("")

  const handleSubmit = async () => {
    if (!selectedType) return

    const notesValue =
      selectedType === "other" ? notes.trim() || null : notes.trim() || null

    await onSubmit(selectedType, notesValue)

    // Reset form on success
    setSelectedType(null)
    setNotes("")
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false)
      setSelectedType(null)
      setNotes("")
    }
  }

  const isValid =
    selectedType !== null &&
    (selectedType !== "other" || notes.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-slate-deep border-cream/20">
        <DialogHeader>
          <DialogTitle className="text-cream">Report Quality Issue</DialogTitle>
          <DialogDescription className="text-cream/70">
            Help improve matching accuracy by identifying issues with this
            detection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Feedback Type Selection */}
          <div className="space-y-3">
            <Label className="text-cream/80">What&apos;s the issue?</Label>
            <RadioGroup
              value={selectedType ?? ""}
              onValueChange={(value: string) => setSelectedType(value as FeedbackType)}
              className="space-y-2"
            >
              {FEEDBACK_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className={cn(
                    "flex items-start space-x-3 rounded-lg border border-cream/20 p-3 cursor-pointer transition-colors",
                    selectedType === option.value
                      ? "border-copper bg-copper/10"
                      : "hover:border-cream/40"
                  )}
                  onClick={() => setSelectedType(option.value)}
                >
                  <RadioGroupItem
                    value={option.value}
                    id={option.value}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor={option.value}
                      className="text-cream cursor-pointer font-medium"
                    >
                      {option.label}
                    </Label>
                    <p className="text-xs text-cream/60 mt-0.5">
                      {option.description}
                    </p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Notes (required for "other", optional otherwise) */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-cream/80">
              {selectedType === "other"
                ? "Please describe the issue *"
                : "Additional notes (optional)"}
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              placeholder={
                selectedType === "other"
                  ? "Please describe the issue..."
                  : "Any additional details..."
              }
              className="bg-slate border-cream/20 text-cream placeholder:text-cream/40 min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="border-cream/20 text-cream hover:bg-cream/10"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="border-brass/60 bg-transparent text-brass-light hover:bg-brass/10"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Feedback"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
