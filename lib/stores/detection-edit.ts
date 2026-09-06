import { create } from 'zustand'

interface DetectionEditStore {
  selectedDetectionId: string | null
  isOpen: boolean
  mode: 'details' | 'classification' | 'roi'
  setMode: (mode: 'details' | 'classification' | 'roi') => void
  openPanel: (detectionId: string) => void
  closePanel: () => void
  setDetectionId: (id: string | null) => void
}

export const useDetectionEdit = create<DetectionEditStore>((set) => ({
  selectedDetectionId: null,
  isOpen: false,
  mode: 'details',
  setMode: (mode) => set({ mode }),
  openPanel: (detectionId) => set({ selectedDetectionId: detectionId, isOpen: true, mode: 'details' }),
  closePanel: () => set({ selectedDetectionId: null, isOpen: false }),
  setDetectionId: (id) => set({ selectedDetectionId: id }),
}))
