import { create } from 'zustand'

interface DetectionEditStore {
  selectedDetectionId: string | null
  isOpen: boolean
  openPanel: (detectionId: string) => void
  closePanel: () => void
  setDetectionId: (id: string | null) => void
}

export const useDetectionEdit = create<DetectionEditStore>((set) => ({
  selectedDetectionId: null,
  isOpen: false,
  openPanel: (detectionId) => set({ selectedDetectionId: detectionId, isOpen: true }),
  closePanel: () => set({ selectedDetectionId: null, isOpen: false }),
  setDetectionId: (id) => set({ selectedDetectionId: id }),
}))
