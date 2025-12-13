import { Page } from '@playwright/test'

/**
 * Test fixtures and data helpers for E2E tests
 *
 * These helpers create test data (photos, detections, etc.) for testing.
 */

export interface TestPhoto {
  id: string
  filename: string
  thumbnailUrl: string
  detectionStatus: 'processing' | 'completed' | 'failed'
  classification: 'has_deer' | 'empty' | null
  detectionCount?: number
  qualityStatus?: 'high_quality' | 'low_quality' | 'manual_review' | 'pending'
  maxConfidence?: number
}

/**
 * Creates test photos via API
 *
 * @param accountId - Account ID to associate photos with
 * @param photos - Array of photo data to create
 */
export async function createTestPhotos(
  accountId: string,
  photos: Partial<TestPhoto>[]
): Promise<TestPhoto[]> {
  // This would call your API to create test photos
  // Implementation depends on your API structure
  const response = await fetch('/api/test/photos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accountId,
      photos,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to create test photos')
  }

  return response.json()
}

/**
 * Seeds the database with test photos for filter testing
 *
 * Creates a variety of photos with different confidence levels and classifications
 * to enable comprehensive filter testing.
 *
 * @param accountId - Account ID to associate photos with
 */
export async function seedPhotoTestData(accountId: string): Promise<{
  highConfidencePhotos: TestPhoto[]
  lowConfidencePhotos: TestPhoto[]
  emptyPhotos: TestPhoto[]
}> {
  const highConfidencePhotos = await createTestPhotos(accountId, [
    {
      filename: 'test-high-1.jpg',
      detectionStatus: 'completed',
      classification: 'has_deer',
      detectionCount: 2,
      qualityStatus: 'high_quality',
      maxConfidence: 95,
    },
    {
      filename: 'test-high-2.jpg',
      detectionStatus: 'completed',
      classification: 'has_deer',
      detectionCount: 1,
      qualityStatus: 'high_quality',
      maxConfidence: 87,
    },
    {
      filename: 'test-high-3.jpg',
      detectionStatus: 'completed',
      classification: 'has_deer',
      detectionCount: 3,
      qualityStatus: 'high_quality',
      maxConfidence: 92,
    },
  ])

  const lowConfidencePhotos = await createTestPhotos(accountId, [
    {
      filename: 'test-low-1.jpg',
      detectionStatus: 'completed',
      classification: 'has_deer',
      detectionCount: 1,
      qualityStatus: 'low_quality',
      maxConfidence: 35,
    },
    {
      filename: 'test-low-2.jpg',
      detectionStatus: 'completed',
      classification: 'has_deer',
      detectionCount: 1,
      qualityStatus: 'manual_review',
      maxConfidence: 48,
    },
  ])

  const emptyPhotos = await createTestPhotos(accountId, [
    {
      filename: 'test-empty-1.jpg',
      detectionStatus: 'completed',
      classification: 'empty',
      detectionCount: 0,
      qualityStatus: 'high_quality',
      maxConfidence: 0,
    },
    {
      filename: 'test-empty-2.jpg',
      detectionStatus: 'completed',
      classification: 'empty',
      detectionCount: 0,
      qualityStatus: 'high_quality',
      maxConfidence: 0,
    },
  ])

  return {
    highConfidencePhotos,
    lowConfidencePhotos,
    emptyPhotos,
  }
}

/**
 * Cleans up test photos
 *
 * @param photoIds - Array of photo IDs to delete
 */
export async function deleteTestPhotos(photoIds: string[]): Promise<void> {
  const response = await fetch('/api/test/photos', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ photoIds }),
  })

  if (!response.ok) {
    throw new Error('Failed to delete test photos')
  }
}

/**
 * Waits for photos to finish processing
 *
 * Polls the page until all photos have a status of 'completed' or 'failed'
 *
 * @param page - Playwright page object
 * @param timeout - Maximum time to wait in milliseconds (default: 30s)
 */
export async function waitForPhotosProcessed(
  page: Page,
  timeout = 30000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    // Check if any photos are still processing
    const processingCount = await page
      .locator('text=Processing')
      .count()

    if (processingCount === 0) {
      // No more processing photos
      return
    }

    // Wait 1 second before checking again
    await page.waitForTimeout(1000)
  }

  throw new Error('Timeout waiting for photos to finish processing')
}

/**
 * Gets the current photo count from the page
 *
 * @param page - Playwright page object
 */
export async function getPhotoCount(page: Page): Promise<number> {
  return page.locator('[data-testid="photo-card"]').count()
}

/**
 * Uploads a test photo via the UI
 *
 * @param page - Playwright page object
 * @param filePath - Path to the test photo file
 */
export async function uploadTestPhoto(
  page: Page,
  filePath: string
): Promise<void> {
  // Click upload button/area
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(filePath)

  // Wait for upload to appear in queue
  await page.waitForSelector('text=Preparing', { timeout: 5000 })

  // Click "Start Upload" button
  const startButton = page.locator('button', { hasText: 'Start Upload' })
  await startButton.click()

  // Wait for upload to complete
  await page.waitForSelector('text=Completed', { timeout: 30000 })
}
