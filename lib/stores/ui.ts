import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Default expanded sections for filter sidebar
const DEFAULT_EXPANDED_SECTIONS = ['sort', 'animal', 'detection', 'date', 'location', 'status']

// Mobile photo grid column count (4-7 columns)
export type MobileGridColumns = 4 | 5 | 6 | 7

interface UIState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  closeSidebar: () => void
  // Photo viewer preferences (persisted)
  showBoundingBoxes: boolean
  setShowBoundingBoxes: (show: boolean) => void
  toggleBoundingBoxes: () => void
  // Mobile photo grid columns (persisted)
  mobileGridColumns: MobileGridColumns
  setMobileGridColumns: (columns: MobileGridColumns) => void
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
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      closeSidebar: () => set({ sidebarOpen: false }),
      // Photo viewer preferences
      showBoundingBoxes: true,
      setShowBoundingBoxes: (show) => set({ showBoundingBoxes: show }),
      toggleBoundingBoxes: () => set((state) => ({ showBoundingBoxes: !state.showBoundingBoxes })),
      // Mobile photo grid columns
      mobileGridColumns: 5,
      setMobileGridColumns: (columns) => set({ mobileGridColumns: columns }),
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
        mobileGridColumns: state.mobileGridColumns,
        filterSidebarOpen: state.filterSidebarOpen,
        filterSidebarExpandedSections: state.filterSidebarExpandedSections,
      }),
    }
  )
)
