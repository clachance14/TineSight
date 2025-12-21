import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Default expanded sections for filter sidebar
const DEFAULT_EXPANDED_SECTIONS = ['sort', 'animal', 'detection', 'date', 'location', 'status']

interface UIState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  // Photo viewer preferences (persisted)
  showBoundingBoxes: boolean
  setShowBoundingBoxes: (show: boolean) => void
  toggleBoundingBoxes: () => void
  // Filter sidebar state (persisted)
  filterSidebarOpen: boolean
  setFilterSidebarOpen: (open: boolean) => void
  toggleFilterSidebar: () => void
  filterSidebarExpandedSections: string[]
  setFilterSidebarExpandedSections: (sections: string[]) => void
  toggleFilterSection: (section: string) => void
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
      // Filter sidebar state
      filterSidebarOpen: true,
      setFilterSidebarOpen: (open) => set({ filterSidebarOpen: open }),
      toggleFilterSidebar: () => set((state) => ({ filterSidebarOpen: !state.filterSidebarOpen })),
      filterSidebarExpandedSections: DEFAULT_EXPANDED_SECTIONS,
      setFilterSidebarExpandedSections: (sections) => set({ filterSidebarExpandedSections: sections }),
      toggleFilterSection: (section) => set((state) => ({
        filterSidebarExpandedSections: state.filterSidebarExpandedSections.includes(section)
          ? state.filterSidebarExpandedSections.filter(s => s !== section)
          : [...state.filterSidebarExpandedSections, section]
      })),
    }),
    {
      name: 'tinesight-ui-preferences',
      partialize: (state) => ({
        // Persist these preferences
        showBoundingBoxes: state.showBoundingBoxes,
        filterSidebarOpen: state.filterSidebarOpen,
        filterSidebarExpandedSections: state.filterSidebarExpandedSections,
      }),
    }
  )
)
