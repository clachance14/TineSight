import { create } from 'zustand'

interface PhotoSelectionState {
  // State
  selectedPhotoIds: Set<string>
  isSelectMode: boolean

  // Actions
  toggleSelectMode: () => void
  enterSelectMode: () => void
  exitSelectMode: () => void

  selectPhoto: (photoId: string) => void
  deselectPhoto: (photoId: string) => void
  togglePhotoSelection: (photoId: string) => void

  selectAll: (photoIds: string[]) => void
  clearSelection: () => void

  isSelected: (photoId: string) => boolean
  getSelectedCount: () => number
}

export const usePhotoSelectionStore = create<PhotoSelectionState>((set, get) => ({
  selectedPhotoIds: new Set(),
  isSelectMode: false,

  toggleSelectMode: () =>
    set((state) => {
      if (state.isSelectMode) {
        // Exiting select mode clears selection
        return { isSelectMode: false, selectedPhotoIds: new Set() }
      }
      return { isSelectMode: true }
    }),

  enterSelectMode: () => set({ isSelectMode: true }),

  exitSelectMode: () =>
    set({
      isSelectMode: false,
      selectedPhotoIds: new Set(),
    }),

  selectPhoto: (photoId) =>
    set((state) => {
      const newSet = new Set(state.selectedPhotoIds)
      newSet.add(photoId)
      return { selectedPhotoIds: newSet, isSelectMode: true }
    }),

  deselectPhoto: (photoId) =>
    set((state) => {
      const newSet = new Set(state.selectedPhotoIds)
      newSet.delete(photoId)
      // Auto-exit select mode if no photos selected
      if (newSet.size === 0) {
        return { selectedPhotoIds: newSet, isSelectMode: false }
      }
      return { selectedPhotoIds: newSet }
    }),

  togglePhotoSelection: (photoId) =>
    set((state) => {
      const newSet = new Set(state.selectedPhotoIds)
      if (newSet.has(photoId)) {
        newSet.delete(photoId)
      } else {
        newSet.add(photoId)
      }
      // Auto-exit select mode if no photos selected
      if (newSet.size === 0) {
        return { selectedPhotoIds: newSet, isSelectMode: false }
      }
      // Auto-enter select mode if first photo selected
      return { selectedPhotoIds: newSet, isSelectMode: true }
    }),

  selectAll: (photoIds) =>
    set(() => ({
      selectedPhotoIds: new Set(photoIds),
      isSelectMode: true,
    })),

  clearSelection: () => set({ selectedPhotoIds: new Set() }),

  isSelected: (photoId) => get().selectedPhotoIds.has(photoId),

  getSelectedCount: () => get().selectedPhotoIds.size,
}))
