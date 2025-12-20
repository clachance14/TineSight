import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  // Photo viewer preferences (persisted)
  showBoundingBoxes: boolean
  setShowBoundingBoxes: (show: boolean) => void
  toggleBoundingBoxes: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      // Photo viewer preferences
      showBoundingBoxes: true,
      setShowBoundingBoxes: (show) => set({ showBoundingBoxes: show }),
      toggleBoundingBoxes: () => set((state) => ({ showBoundingBoxes: !state.showBoundingBoxes })),
    }),
    {
      name: 'tinesight-ui-preferences',
      partialize: (state) => ({
        // Only persist these preferences (not sidebar state)
        showBoundingBoxes: state.showBoundingBoxes,
      }),
    }
  )
)
