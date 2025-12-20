import { create } from 'zustand'

interface DetectionHoverStore {
  hoveredDetectionId: string | null
  setHoveredDetectionId: (id: string | null) => void
}

export const useDetectionHover = create<DetectionHoverStore>((set) => ({
  hoveredDetectionId: null,
  setHoveredDetectionId: (id) => set({ hoveredDetectionId: id }),
}))
