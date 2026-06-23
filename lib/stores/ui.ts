import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Default expanded sections for filter sidebar
const DEFAULT_EXPANDED_SECTIONS = ['sort', 'animal', 'detection', 'date', 'location', 'status']

interface UIState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  closeSidebar: () => void
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
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      closeSidebar: () => set({ sidebarOpen: false }),
      // Photo viewer preferences.
      // Default OFF: the photo detail view now shows calm numbered pins and draws
      // a box only for the located/hovered detection. This toggles ALL boxes on.
      showBoundingBoxes: false,
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
      version: 2, // Bump version to trigger migration
      skipHydration: true, // Prevents auto-hydration crash on iOS Safari
      partialize: (state) => ({
        // Persist these preferences
        // NOTE: mobileGridColumns intentionally NOT persisted - hydrating it
        // after render causes iOS Safari to crash from layout thrashing
        showBoundingBoxes: state.showBoundingBoxes,
        filterSidebarOpen: state.filterSidebarOpen,
        filterSidebarExpandedSections: state.filterSidebarExpandedSections,
      }),
      // Migration: remove mobileGridColumns from old stored state
      migrate: (persistedState: unknown, fromVersion: number) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = persistedState as any
        // Delete the old mobileGridColumns to prevent hydration crash
        if (state && 'mobileGridColumns' in state) {
          delete state.mobileGridColumns
        }
        // v1 -> v2: drop the persisted showBoundingBoxes so the new "off by
        // default" (calm pins) preference takes effect for existing users.
        if (state && fromVersion < 2 && 'showBoundingBoxes' in state) {
          delete state.showBoundingBoxes
        }
        return state
      },
    }
  )
)
