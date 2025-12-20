import { create } from 'zustand'

export interface UploadFile {
  id: string
  file?: File // Optional - released after upload starts to free memory
  filename: string
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  progress: number
  imageId?: string
  uploadUrl?: string
  error?: string
  // EXIF metadata
  capturedAt?: Date | null
  make?: string | null
  model?: string | null
  deviceIdentifier?: string | null
  exifSignature?: string | null
  exifData?: Record<string, unknown>
}

export interface UploadInitData {
  fileId: string
  imageId: string
  uploadUrl: string
}

export interface FileWithMetadata {
  file: File
  capturedAt?: Date | null
  make?: string | null
  model?: string | null
  deviceIdentifier?: string | null
  exifSignature?: string | null
  exifData?: Record<string, unknown>
}

export interface LocationData {
  lat: number
  lng: number
  areaName: string
  directionCompass?: number  // 0-360
  directionNotes?: string
}

interface UploadState {
  // State
  uploadQueue: UploadFile[]
  currentBatchId: string | null
  isPreparing: boolean
  isUploading: boolean
  overallProgress: number
  completedCount: number
  failedCount: number
  totalCount: number
  pendingLocation: LocationData | null
  showLocationPicker: boolean

  // Actions
  addFiles: (files: FileWithMetadata[]) => void
  removeFile: (id: string) => void
  clearQueue: () => void
  clearCompletedFiles: () => void
  setIsPreparing: (isPreparing: boolean) => void
  startUpload: (batchId: string, uploadData: UploadInitData[]) => void
  updateFileProgress: (id: string, progress: number) => void
  markFileCompleted: (id: string) => void
  markFileFailed: (id: string, error: string) => void
  setPendingLocation: (location: LocationData | null) => void
  setShowLocationPicker: (show: boolean) => void
  reset: () => void
}

const initialState = {
  uploadQueue: [],
  currentBatchId: null,
  isPreparing: false,
  isUploading: false,
  overallProgress: 0,
  completedCount: 0,
  failedCount: 0,
  totalCount: 0,
  pendingLocation: null,
  showLocationPicker: false,
}

export const useUploadStore = create<UploadState>((set) => ({
  ...initialState,

  addFiles: (filesWithMetadata) =>
    set((state) => {
      const newFiles: UploadFile[] = filesWithMetadata.map(
        ({ file, capturedAt, make, model, deviceIdentifier, exifSignature, exifData }) => ({
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          file,
          filename: file.name,
          status: 'pending',
          progress: 0,
          capturedAt: capturedAt ?? null,
          make: make ?? null,
          model: model ?? null,
          deviceIdentifier: deviceIdentifier ?? null,
          exifSignature: exifSignature ?? null,
          exifData: exifData ?? {},
        })
      )

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

  clearCompletedFiles: () =>
    set((state) => ({
      uploadQueue: state.uploadQueue.filter((f) => f.status !== 'completed'),
    })),

  setIsPreparing: (isPreparing) => set({ isPreparing }),

  startUpload: (batchId, uploadData) =>
    set((state) => {
      // Match upload data to files in queue and update their state
      // Note: We DON'T clear file here - it's still needed for the XHR upload
      // The file will be garbage collected after the upload completes
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
        isPreparing: false,
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
      const updatedQueue = state.uploadQueue.map((file) => {
        if (file.id === id) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { file: _fileData, ...rest } = file // Destructure to release file from memory
          return { ...rest, status: 'completed' as const, progress: 100 }
        }
        return file
      })

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
      const updatedQueue = state.uploadQueue.map((file) => {
        if (file.id === id) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { file: _fileData, ...rest } = file // Destructure to release file from memory
          return { ...rest, status: 'failed' as const, error }
        }
        return file
      })

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

  setPendingLocation: (location) => set({ pendingLocation: location }),

  setShowLocationPicker: (show) => set({ showLocationPicker: show }),

  reset: () => set(initialState),
}))

// Batched progress updater - collects updates and flushes every 250ms
// This dramatically reduces re-renders during bulk uploads
let progressBatch: Map<string, number> = new Map()
let flushTimeout: ReturnType<typeof setTimeout> | null = null

const flushProgressUpdates = () => {
  if (progressBatch.size === 0) return

  const updates = new Map(progressBatch)
  progressBatch.clear()

  useUploadStore.setState((state) => {
    const updatedQueue = state.uploadQueue.map((file) => {
      const newProgress = updates.get(file.id)
      return newProgress !== undefined ? { ...file, progress: newProgress } : file
    })

    const totalProgress = updatedQueue.reduce((sum, f) => sum + f.progress, 0)
    const overallProgress = updatedQueue.length > 0
      ? Math.round(totalProgress / updatedQueue.length)
      : 0

    return { uploadQueue: updatedQueue, overallProgress }
  })
}

export const batchedUpdateProgress = (id: string, progress: number) => {
  progressBatch.set(id, progress)

  if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      flushTimeout = null
      flushProgressUpdates()
    }, 250) // Flush every 250ms - max 4 state updates per second
  }
}
