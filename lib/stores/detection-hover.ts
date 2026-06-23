import { create } from 'zustand'

interface DetectionHoverStore {
  /** Detection currently hovered (mouse) — drives a transient box "peek". */
  hoveredDetectionId: string | null
  setHoveredDetectionId: (id: string | null) => void
  /**
   * Detection "located" by an explicit tap/click — persists until another is
   * picked or it is cleared. Boxes are hidden by default; tapping a numbered pin
   * or a detection row pins that one so its box draws. Tapping the already-pinned
   * detection a second time is what opens the edit panel (handled by callers).
   */
  pinnedDetectionId: string | null
  setPinnedDetectionId: (id: string | null) => void
}

export const useDetectionHover = create<DetectionHoverStore>((set) => ({
  hoveredDetectionId: null,
  setHoveredDetectionId: (id) => set({ hoveredDetectionId: id }),
  pinnedDetectionId: null,
  setPinnedDetectionId: (id) => set({ pinnedDetectionId: id }),
}))
