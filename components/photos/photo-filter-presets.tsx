"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useToast } from "@/lib/hooks/use-toast"
import {
  useFilterPresets,
  useCreateFilterPreset,
  useDeleteFilterPreset,
  useUpdateFilterPreset,
} from "@/lib/hooks/use-filter-presets"
import { Save, ChevronDown, Star, Trash2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PhotoFilters } from "./photo-filters"

interface FilterPresetsProps {
  currentFilters: PhotoFilters
  onLoadPreset: (filters: PhotoFilters) => void
}

export function PhotoFilterPresets({
  currentFilters,
  onLoadPreset,
}: FilterPresetsProps) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [presetName, setPresetName] = useState("")
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null)
  const { toast } = useToast()

  // Fetch presets
  const { data: presetsData, isLoading: isLoadingPresets } = useFilterPresets()
  const presets = presetsData?.presets || []

  // Mutations
  const createPreset = useCreateFilterPreset()
  const updatePreset = useUpdateFilterPreset()
  const deletePreset = useDeleteFilterPreset()

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for this preset",
        variant: "destructive",
      })
      return
    }

    try {
      await createPreset.mutateAsync({
        name: presetName.trim(),
        filters: currentFilters as Record<string, unknown>,
      })

      toast({
        title: "Preset saved",
        description: `"${presetName}" has been saved successfully`,
      })

      setPresetName("")
      setSaveDialogOpen(false)
    } catch (error) {
      toast({
        title: "Failed to save preset",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      })
    }
  }

  const handleLoadPreset = (filters: Record<string, unknown>) => {
    onLoadPreset(filters as PhotoFilters)
    toast({
      title: "Preset loaded",
      description: "Filters have been applied",
    })
  }

  const handleToggleDefault = async (presetId: string, isCurrentlyDefault: boolean) => {
    try {
      await updatePreset.mutateAsync({
        id: presetId,
        data: {
          filters: {
            ...presets.find(p => p.id === presetId)?.filters,
            isDefault: !isCurrentlyDefault,
          } as Record<string, unknown>,
        },
      })

      toast({
        title: isCurrentlyDefault ? "Default removed" : "Default set",
        description: isCurrentlyDefault
          ? "This preset is no longer the default"
          : "This preset will be applied by default",
      })
    } catch (error) {
      toast({
        title: "Failed to update preset",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      })
    }
  }

  const handleDeletePreset = async () => {
    if (!deletePresetId) return

    try {
      await deletePreset.mutateAsync(deletePresetId)

      toast({
        title: "Preset deleted",
        description: "The preset has been removed",
      })

      setDeletePresetId(null)
    } catch (error) {
      toast({
        title: "Failed to delete preset",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      })
    }
  }

  const isDefault = (filters: Record<string, unknown>) => {
    return (filters as { isDefault?: boolean }).isDefault === true
  }

  return (
    <div className="flex items-center gap-2">
      {/* Save Preset Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
          >
            <Save className="size-3" />
            <span className="hidden sm:inline">Save preset</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save filter preset</DialogTitle>
            <DialogDescription>
              Save your current filter settings for quick access later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="preset-name" className="text-sm font-medium">
                Preset name
              </label>
              <Input
                id="preset-name"
                placeholder="e.g., High quality bucks"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleSavePreset()
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSaveDialogOpen(false)
                setPresetName("")
              }}
              disabled={createPreset.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePreset}
              disabled={createPreset.isPending || !presetName.trim()}
            >
              {createPreset.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Preset Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={isLoadingPresets || presets.length === 0}
          >
            {isLoadingPresets ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                <span className="hidden sm:inline">Loading...</span>
              </>
            ) : (
              <>
                Presets
                {presets.length > 0 && (
                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                    {presets.length}
                  </span>
                )}
                <ChevronDown className="size-3 opacity-50" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {presets.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No saved presets yet
            </div>
          ) : (
            <>
              {presets.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  className="flex items-center justify-between gap-2 pr-2"
                  onSelect={(e) => {
                    // Prevent closing when clicking star or delete
                    if (
                      (e.target as HTMLElement).closest('button[data-action]')
                    ) {
                      e.preventDefault()
                    }
                  }}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => handleLoadPreset(preset.filters)}
                  >
                    <Star
                      className={cn(
                        "size-3 flex-shrink-0",
                        isDefault(preset.filters)
                          ? "fill-copper text-copper"
                          : "text-muted-foreground"
                      )}
                    />
                    <span className="truncate text-sm">{preset.name}</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      data-action="toggle-default"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleDefault(preset.id, isDefault(preset.filters))
                      }}
                      className={cn(
                        "rounded p-1 transition-colors hover:bg-accent",
                        updatePreset.isPending && "pointer-events-none opacity-50"
                      )}
                      title={isDefault(preset.filters) ? "Remove default" : "Set as default"}
                    >
                      <Star
                        className={cn(
                          "size-3",
                          isDefault(preset.filters)
                            ? "fill-copper text-copper"
                            : "text-muted-foreground"
                        )}
                      />
                    </button>
                    <button
                      data-action="delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeletePresetId(preset.id)
                      }}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Delete preset"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deletePresetId !== null}
        onOpenChange={(open) => !open && setDeletePresetId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete preset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this filter preset. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePreset.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePreset}
              disabled={deletePreset.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePreset.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
