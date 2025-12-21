'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePhotoSelectionStore } from '@/lib/stores/photo-selection'
import { Button } from '@/components/ui/button'
import { LocationPickerModal, type LocationData } from './location-picker-modal'
import { BulkDeleteModal } from './bulk-delete-modal'
import { ExportModal } from './export-modal'
import { X, MapPin, Trash2, CheckSquare, Loader2, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LocationWithPhotoCount } from '@/lib/services/locations'
import type { PhotoFilters } from '@/lib/services/photos'

interface SelectionToolbarProps {
  /** All photo IDs currently visible (for Select All) */
  visiblePhotoIds: string[]
  /** Existing locations for the picker */
  locations: LocationWithPhotoCount[]
  /** Total count of photos matching current filters */
  totalMatchingCount?: number
  /** Current filter criteria for "select all matching" */
  currentFilters?: PhotoFilters
}

export function SelectionToolbar({
  visiblePhotoIds,
  locations,
  totalMatchingCount,
  currentFilters
}: SelectionToolbarProps) {
  const queryClient = useQueryClient()
  const {
    selectedPhotoIds,
    isSelectMode,
    exitSelectMode,
    selectAll,
    clearSelection,
  } = usePhotoSelectionStore()

  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [isLoadingAllIds, setIsLoadingAllIds] = useState(false)

  const selectedCount = selectedPhotoIds.size
  const allSelected = selectedCount === visiblePhotoIds.length && selectedCount > 0
  const canSelectMore = totalMatchingCount !== undefined && totalMatchingCount > selectedCount

  // Fetch all matching IDs and select them
  const handleSelectAllMatching = async () => {
    if (!currentFilters) return

    setIsLoadingAllIds(true)
    try {
      const res = await fetch('/api/photos/ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: currentFilters })
      })

      if (!res.ok) throw new Error('Failed to fetch photo IDs')

      const { photoIds } = await res.json()
      selectAll(photoIds)
    } catch (error) {
      console.error('Failed to select all matching:', error)
    } finally {
      setIsLoadingAllIds(false)
    }
  }

  // Bulk location update mutation
  const locationMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const res = await fetch('/api/photos/bulk-location', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoIds: Array.from(selectedPhotoIds),
          locationId,
        }),
      })
      if (!res.ok) throw new Error('Failed to update location')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      exitSelectMode()
    },
  })

  const handleLocationConfirm = (location: LocationData) => {
    if (location.locationId) {
      locationMutation.mutate(location.locationId)
    }
    setShowLocationPicker(false)
  }

  const handleSelectAll = () => {
    if (allSelected) {
      clearSelection()
    } else {
      selectAll(visiblePhotoIds)
    }
  }

  if (!isSelectMode) return null

  return (
    <>
      {/* Floating toolbar - fixed at bottom */}
      <div
        className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
          'flex items-center gap-4 px-6 py-3',
          'bg-slate-deep/95 border border-slate backdrop-blur-sm rounded-xl shadow-xl'
        )}
      >
        {/* Selection count and "select all matching" banner */}
        <div className="flex items-center gap-2">
          <span className="text-cream font-medium whitespace-nowrap">
            {selectedCount} selected
          </span>

          {/* "Select all matching" banner - shows when more photos match the filter */}
          {canSelectMore && totalMatchingCount && (
            <button
              onClick={handleSelectAllMatching}
              disabled={isLoadingAllIds}
              className="text-xs text-copper hover:text-copper-light underline whitespace-nowrap disabled:opacity-50"
            >
              {isLoadingAllIds ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading...
                </span>
              ) : (
                `Select all ${totalMatchingCount}?`
              )}
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-slate" />

        {/* Select All toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSelectAll}
          className="text-cream-dark hover:text-cream hover:bg-slate"
        >
          <CheckSquare className="h-4 w-4 mr-2" />
          {allSelected ? 'Deselect All' : 'Select All'}
        </Button>

        {/* Divider */}
        <div className="h-6 w-px bg-slate" />

        {/* Action buttons */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowLocationPicker(true)}
          disabled={locationMutation.isPending}
          className="text-cream-dark hover:text-cream hover:bg-slate"
        >
          <MapPin className="h-4 w-4 mr-2" />
          Set Location
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDeleteModal(true)}
          className="text-red-400 hover:text-red-300 hover:bg-red-950/50"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowExportModal(true)}
          className="text-cream-dark hover:text-cream hover:bg-slate"
        >
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>

        {/* Divider */}
        <div className="h-6 w-px bg-slate" />

        {/* Cancel */}
        <Button
          variant="ghost"
          size="icon"
          onClick={exitSelectMode}
          className="text-cream-dark hover:text-cream hover:bg-slate"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Location Picker Modal (reuse existing) */}
      <LocationPickerModal
        isOpen={showLocationPicker}
        onConfirm={handleLocationConfirm}
        onSkip={() => setShowLocationPicker(false)}
        existingLocations={locations}
      />

      {/* Delete Confirmation Modal */}
      <BulkDeleteModal
        isOpen={showDeleteModal}
        photoCount={selectedCount}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={() => {
          exitSelectMode()
          queryClient.invalidateQueries({ queryKey: ['photos'] })
        }}
        photoIds={Array.from(selectedPhotoIds)}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        photoCount={selectedCount}
        photoIds={Array.from(selectedPhotoIds)}
        onClose={() => setShowExportModal(false)}
      />
    </>
  )
}
