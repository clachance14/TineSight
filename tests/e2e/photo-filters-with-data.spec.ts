import { test, expect } from '@playwright/test'
import { authenticateUser } from './helpers/auth'
import { seedPhotoTestData, deleteTestPhotos, getPhotoCount } from './helpers/fixtures'

/**
 * E2E Tests for Photo Confidence Filter with Seeded Test Data
 *
 * This version of the test suite seeds test data before running tests,
 * ensuring consistent test results regardless of existing data.
 *
 * NOTE: This requires implementing the test data seeding API endpoints.
 */

test.describe('Photo Confidence Filter (with test data)', () => {
  let testAccountId: string
  let testPhotoIds: string[] = []

  // Setup: Create test data before all tests
  test.beforeAll(async () => {
    // Get account ID from environment or create test account
    testAccountId = process.env.TEST_ACCOUNT_ID || 'test-account-id'

    // Seed test data
    const { highConfidencePhotos, lowConfidencePhotos, emptyPhotos } =
      await seedPhotoTestData(testAccountId)

    // Collect photo IDs for cleanup
    testPhotoIds = [
      ...highConfidencePhotos.map(p => p.id),
      ...lowConfidencePhotos.map(p => p.id),
      ...emptyPhotos.map(p => p.id),
    ]
  })

  // Cleanup: Delete test data after all tests
  test.afterAll(async () => {
    if (testPhotoIds.length > 0) {
      await deleteTestPhotos(testPhotoIds)
    }
  })

  // Setup: Authenticate and navigate to photos page before each test
  test.beforeEach(async ({ page }) => {
    await authenticateUser(page)
    await page.goto('/photos')
    await page.waitForSelector('text=Filters')
  })

  test('should filter photos by confidence threshold', async ({ page }) => {
    // With seeded data, we know exactly what to expect:
    // - 3 high confidence photos (>85%)
    // - 2 low confidence photos (<50%)
    // - 2 empty photos (0%)

    // Default state: hasDeer=true, minConfidence=50
    // Should show only the 3 high confidence photos
    let photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(3)

    // Adjust slider to 0% - should show all 5 deer photos (high + low)
    const slider = page.locator('input[type="range"]').last()
    await slider.fill('0')
    await page.waitForTimeout(500) // Wait for query refetch

    photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(5) // 3 high + 2 low confidence

    // Adjust to 85% - should show only high confidence photos
    await slider.fill('85')
    await page.waitForTimeout(500)

    photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(3)

    // Adjust to 100% - should show 0 photos (no photos have 100% confidence)
    await slider.fill('100')
    await page.waitForTimeout(500)

    photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(0)
  })

  test('should combine hasDeer and confidence filters', async ({ page }) => {
    // Default: hasDeer=true, minConfidence=50 → 3 high confidence photos
    let photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(3)

    // Change to hasDeer=false (empty) - should show 2 empty photos
    await page.locator('button', { hasText: 'Empty' }).click()
    await page.waitForTimeout(500)

    photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(2)

    // Change to hasDeer=null (all) - should show all 7 photos
    await page.locator('button', { hasText: 'All' }).first().click()
    await page.waitForTimeout(500)

    photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(7) // 3 high + 2 low + 2 empty
  })

  test('should show correct photo count stats', async ({ page }) => {
    // Default filters: hasDeer=true, minConfidence=50
    // Should show 3 completed photos in stats

    const totalPhotos = await page.locator('text=Total Photos').locator('..').locator('.text-2xl').textContent()
    expect(totalPhotos?.trim()).toBe('3')

    // Change confidence to 0 - should show 5 photos
    const slider = page.locator('input[type="range"]').last()
    await slider.fill('0')
    await page.waitForTimeout(500)

    const newTotalPhotos = await page.locator('text=Total Photos').locator('..').locator('.text-2xl').textContent()
    expect(newTotalPhotos?.trim()).toBe('5')
  })

  test('should preserve filter state across navigation', async ({ page }) => {
    // Set filters
    const slider = page.locator('input[type="range"]').last()
    await slider.fill('80')
    await page.waitForTimeout(500)

    // Navigate to a photo detail page
    const firstPhoto = page.locator('[data-testid="photo-card"]').first()
    await firstPhoto.click()

    // Wait for detail page to load
    await page.waitForURL(/\/photos\/[a-zA-Z0-9-]+/)

    // Navigate back
    await page.goBack()
    await page.waitForSelector('text=Filters')

    // Verify filters are preserved
    await expect(page.locator('text=80%')).toBeVisible()
    const photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(3) // Same as before navigation
  })

  test('should handle URL params correctly with test data', async ({ page }) => {
    // Navigate with specific params
    await page.goto('/photos?hasDeer=true&minConfidence=85')
    await page.waitForSelector('text=Filters')

    // Should show only high confidence photos (3)
    const photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(3)

    // Verify filter UI reflects URL params
    await expect(page.locator('text=85%')).toBeVisible()
    const hasDeerButton = page.locator('button', { hasText: 'Has Deer' })
    await expect(hasDeerButton).toHaveAttribute('data-variant', 'default')
  })

  test('should handle edge case: no photos match filters', async ({ page }) => {
    // Set impossible filter: hasDeer=true, minConfidence=100
    const slider = page.locator('input[type="range"]').last()
    await slider.fill('100')
    await page.waitForTimeout(500)

    // Should show 0 photos
    const photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(0)

    // Should show empty state (if implemented)
    // await expect(page.locator('text=No photos found')).toBeVisible()
  })

  test('should update photo grid when toggling confidence filter', async ({ page }) => {
    // Start with confidence filter ON at 50%
    let photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(3)

    // Toggle OFF
    const toggleButton = page.locator('button', { hasText: 'On' }).last()
    await toggleButton.click()
    await page.waitForTimeout(500)

    // Should show all deer photos (no confidence filter)
    photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(5) // 3 high + 2 low

    // Toggle back ON
    const offButton = page.locator('button', { hasText: 'Off' }).last()
    await offButton.click()
    await page.waitForTimeout(500)

    // Should be back to 3 (filter restored at 50%)
    photoCount = await getPhotoCount(page)
    expect(photoCount).toBe(3)
  })
})
