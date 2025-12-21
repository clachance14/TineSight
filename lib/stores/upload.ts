import { create } from 'zustand'
// Note: setActiveUploadSessionId is now called in upload/page.tsx at session creation time,
// not per-batch in startUpload. This ensures we track the full session, not just the last batch.

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
  locationId?: string
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

      // Adjust completed/failed counts if removing a completed/failed file
      let newCompletedCount = state.completedCount
      let newFailedCount = state.failedCount
      if (fileToRemove.status === 'completed') {
        newCompletedCount = state.completedCount - 1
      } else if (fileToRemove.status === 'failed') {
        newFailedCount = state.failedCount - 1
      }

      // Recalculate overall progress based on completion counts
      let newOverallProgress = state.overallProgress
      if (state.isUploading && newTotalCount > 0) {
        const completedProgress = (newCompletedCount + newFailedCount) * 100
        const uploadingFiles = newQueue.filter((f) => f.status === 'uploading')
        const uploadingProgress = uploadingFiles.reduce((sum, f) => sum + f.progress, 0)
        newOverallProgress = Math.round((completedProgress + uploadingProgress) / newTotalCount)
      }

      return {
        uploadQueue: newQueue,
        totalCount: newTotalCount,
        completedCount: newCompletedCount,
        failedCount: newFailedCount,
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

  startUpload: (batchId, uploadData) => {
    // Note: Session ID is set once in upload/page.tsx at session creation time,
    // not per-batch here. This properly aggregates stats across all batches.

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
    })
  },

  updateFileProgress: (id, progress) =>
    set((state) => {
      const updatedQueue = state.uploadQueue.map((file) =>
        file.id === id ? { ...file, progress } : file
      )

      // Calculate overall progress based on completion counts (not queue average)
      const completedProgress = state.completedCount * 100
      const uploadingFiles = updatedQueue.filter((f) => f.status === 'uploading')
      const uploadingProgress = uploadingFiles.reduce((sum, f) => sum + f.progress, 0)
      const overallProgress = state.totalCount > 0
        ? Math.round((completedProgress + uploadingProgress) / state.totalCount)
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

      // Calculate overall progress based on completion counts (not queue average)
      const completedProgress = newCompletedCount * 100
      const uploadingFiles = updatedQueue.filter((f) => f.status === 'uploading')
      const uploadingProgress = uploadingFiles.reduce((sum, f) => sum + f.progress, 0)
      const overallProgress = state.totalCount > 0
        ? Math.round((completedProgress + uploadingProgress) / state.totalCount)
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

      // Calculate overall progress based on completion counts (not queue average)
      // Failed files count toward progress completion (they're done, just failed)
      const completedProgress = (state.completedCount + newFailedCount) * 100
      const uploadingFiles = updatedQueue.filter((f) => f.status === 'uploading')
      const uploadingProgress = uploadingFiles.reduce((sum, f) => sum + f.progress, 0)
      const overallProgress = state.totalCount > 0
        ? Math.round((completedProgress + uploadingProgress) / state.totalCount)
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

    // Calculate overall progress based on completion counts (not queue average)
    const completedProgress = (state.completedCount + state.failedCount) * 100
    const uploadingFiles = updatedQueue.filter((f) => f.status === 'uploading')
    const uploadingProgress = uploadingFiles.reduce((sum, f) => sum + f.progress, 0)
    const overallProgress = state.totalCount > 0
      ? Math.round((completedProgress + uploadingProgress) / state.totalCount)
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
