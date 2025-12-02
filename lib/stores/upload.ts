import { create } from 'zustand'

export interface UploadFile {
  id: string
  file: File
  filename: string
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  progress: number
  imageId?: string
  uploadUrl?: string
  error?: string
}

export interface UploadInitData {
  fileId: string
  imageId: string
  uploadUrl: string
}

interface UploadState {
  // State
  uploadQueue: UploadFile[]
  currentBatchId: string | null
  isUploading: boolean
  overallProgress: number
  completedCount: number
  failedCount: number
  totalCount: number

  // Actions
  addFiles: (files: File[]) => void
  removeFile: (id: string) => void
  clearQueue: () => void
  startUpload: (batchId: string, uploadData: UploadInitData[]) => void
  updateFileProgress: (id: string, progress: number) => void
  markFileCompleted: (id: string) => void
  markFileFailed: (id: string, error: string) => void
  reset: () => void
}

const initialState = {
  uploadQueue: [],
  currentBatchId: null,
  isUploading: false,
  overallProgress: 0,
  completedCount: 0,
  failedCount: 0,
  totalCount: 0,
}

export const useUploadStore = create<UploadState>((set) => ({
  ...initialState,

  addFiles: (files) =>
    set((state) => {
      const newFiles: UploadFile[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        filename: file.name,
        status: 'pending',
        progress: 0,
      }))

      return {
        uploadQueue: [...state.uploadQueue, ...newFiles],
        totalCount: state.totalCount + newFiles.length,
      }
    }),

  removeFile: (id) =>
    set((state) => {
      const fileToRemove = state.uploadQueue.find((f) => f.id === id)
      if (!fileToRemove) return state

      const newQueue = state.uploadQueue.filter((f) => f.id !== id)
      const newTotalCount = state.totalCount - 1

      // Recalculate overall progress if upload is in progress
      let newOverallProgress = state.overallProgress
      if (state.isUploading && newQueue.length > 0) {
        const totalProgress = newQueue.reduce((sum, f) => sum + f.progress, 0)
        newOverallProgress = Math.round(totalProgress / newQueue.length)
      }

      return {
        uploadQueue: newQueue,
        totalCount: newTotalCount,
        overallProgress: newOverallProgress,
      }
    }),

  clearQueue: () =>
    set(() => ({
      uploadQueue: [],
      totalCount: 0,
      overallProgress: 0,
      completedCount: 0,
      failedCount: 0,
    })),

  startUpload: (batchId, uploadData) =>
    set((state) => {
      // Match upload data to files in queue and update their state
      const updatedQueue = state.uploadQueue.map((file) => {
        const matchingData = uploadData.find((data) => data.fileId === file.id)
        if (matchingData) {
          return {
            ...file,
            status: 'uploading' as const,
            imageId: matchingData.imageId,
            uploadUrl: matchingData.uploadUrl,
          }
        }
        return file
      })

      return {
        uploadQueue: updatedQueue,
        currentBatchId: batchId,
        isUploading: true,
      }
    }),

  updateFileProgress: (id, progress) =>
    set((state) => {
      const updatedQueue = state.uploadQueue.map((file) =>
        file.id === id ? { ...file, progress } : file
      )

      // Calculate overall progress
      const totalProgress = updatedQueue.reduce((sum, f) => sum + f.progress, 0)
      const overallProgress = updatedQueue.length > 0
        ? Math.round(totalProgress / updatedQueue.length)
        : 0

      return {
        uploadQueue: updatedQueue,
        overallProgress,
      }
    }),

  markFileCompleted: (id) =>
    set((state) => {
      const updatedQueue = state.uploadQueue.map((file) =>
        file.id === id
          ? { ...file, status: 'completed' as const, progress: 100 }
          : file
      )

      const newCompletedCount = state.completedCount + 1
      const totalProgress = updatedQueue.reduce((sum, f) => sum + f.progress, 0)
      const overallProgress = updatedQueue.length > 0
        ? Math.round(totalProgress / updatedQueue.length)
        : 0

      // Check if all uploads are complete
      const allComplete = updatedQueue.every(
        (f) => f.status === 'completed' || f.status === 'failed'
      )

      return {
        uploadQueue: updatedQueue,
        completedCount: newCompletedCount,
        overallProgress,
        isUploading: !allComplete,
      }
    }),

  markFileFailed: (id, error) =>
    set((state) => {
      const updatedQueue = state.uploadQueue.map((file) =>
        file.id === id
          ? { ...file, status: 'failed' as const, error }
          : file
      )

      const newFailedCount = state.failedCount + 1
      const totalProgress = updatedQueue.reduce((sum, f) => sum + f.progress, 0)
      const overallProgress = updatedQueue.length > 0
        ? Math.round(totalProgress / updatedQueue.length)
        : 0

      // Check if all uploads are complete
      const allComplete = updatedQueue.every(
        (f) => f.status === 'completed' || f.status === 'failed'
      )

      return {
        uploadQueue: updatedQueue,
        failedCount: newFailedCount,
        overallProgress,
        isUploading: !allComplete,
      }
    }),

  reset: () => set(initialState),
}))
