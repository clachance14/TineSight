import { create } from 'zustand'

interface BatchSelectionState {
  // State
  selectedMatchIds: Set<string>

  // Actions
  toggleSelection: (matchId: string) => void
  selectAll: (matchIds: string[]) => void
  clearSelection: () => void
  isSelected: (matchId: string) => boolean
  getSelectedCount: () => number
}

export const useBatchSelectionStore = create<BatchSelectionState>((set, get) => ({
  selectedMatchIds: new Set(),

  toggleSelection: (matchId) =>
    set((state) => {
      const newSet = new Set(state.selectedMatchIds)
      if (newSet.has(matchId)) {
        newSet.delete(matchId)
      } else {
        newSet.add(matchId)
      }
      return { selectedMatchIds: newSet }
    }),

  selectAll: (matchIds) =>
    set(() => ({
      selectedMatchIds: new Set(matchIds),
    })),

  clearSelection: () => set({ selectedMatchIds: new Set() }),

  isSelected: (matchId) => get().selectedMatchIds.has(matchId),

  getSelectedCount: () => get().selectedMatchIds.size,
}))
