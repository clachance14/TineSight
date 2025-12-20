import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Photo Confidence Filter
 *
 * Tests the confidence filter functionality on the photos page:
 * - Default filter state (hasDeer=true, minConfidence=50)
 * - Slider adjustments and photo updates
 * - Toggle filter on/off with threshold preservation
 * - Copy link button generates correct URLs
 * - URL params restore filter state
 */

test.describe('Photo Confidence Filter', () => {
  // Setup: Navigate to photos page before each test
  test.beforeEach(async ({ page }) => {
    // Note: This assumes authentication is handled separately
    // You may need to add authentication steps here
    await page.goto('/photos')

    // Wait for the page to load and filters to render
    await page.waitForSelector('text=Filters')
  })

  test('should apply default filters on page load', async ({ page }) => {
    // Verify default filter state: hasDeer=true, minConfidence=50

    // Check that "Has Deer" button is selected (default variant)
    const hasDeerButton = page.locator('button', { hasText: 'Has Deer' })
    await expect(hasDeerButton).toHaveAttribute('data-variant', 'default')

    // Check that confidence filter is ON by default
    const confidenceToggle = page.locator('button', { hasText: 'On' }).last()
    await expect(confidenceToggle).toBeVisible()

    // Check that confidence threshold shows 50%
    const confidenceValue = page.locator('text=50%')
    await expect(confidenceValue).toBeVisible()

    // Verify active filters count shows "2 active"
    const activeFilterBadge = page.locator('text=2 active')
    await expect(activeFilterBadge).toBeVisible()

    // Verify active filter tags are displayed
    await expect(page.locator('text=Has Deer')).toBeVisible()
    await expect(page.locator('text=Confidence:').locator('text=>=50%')).toBeVisible()
  })

  test('should adjust slider and verify photos update', async ({ page }) => {
    // Get initial photo count
    const initialPhotoCount = await page.locator('[data-testid="photo-card"]').count()

    // Find the confidence slider
    const slider = page.locator('input[type="range"]').last()

    // Adjust slider to 80%
    // Note: Slider values are from 0-100 with step=5
    await slider.fill('80')

    // Verify the displayed confidence value updates
    const confidenceValue = page.locator('span', { hasText: '80%' })
    await expect(confidenceValue).toBeVisible()

    // Wait for photos to update (TanStack Query refetch)
    await page.waitForTimeout(500)

    // Verify photo count changed (should be fewer with higher threshold)
    const newPhotoCount = await page.locator('[data-testid="photo-card"]').count()

    // With higher confidence, we expect fewer or equal photos
    expect(newPhotoCount).toBeLessThanOrEqual(initialPhotoCount)

    // Verify active filter tag shows new value
    await expect(page.locator('text=Confidence:').locator('text=>=80%')).toBeVisible()
  })

  test('should toggle filter off/on and preserve threshold', async ({ page }) => {
    // Set slider to 75%
    const slider = page.locator('input[type="range"]').last()
    await slider.fill('75')

    // Verify 75% is displayed
    await expect(page.locator('text=75%')).toBeVisible()

    // Click the Off toggle button
    const toggleButton = page.locator('button', { hasText: 'On' }).last()
    await toggleButton.click()

    // Verify toggle switched to "Off"
    await expect(page.locator('button', { hasText: 'Off' }).last()).toBeVisible()

    // Verify slider is disabled
    await expect(slider).toBeDisabled()

    // Verify confidence filter tag is removed from active filters
    await expect(page.locator('text=Confidence:')).not.toBeVisible()

    // Verify active filters count decreased
    await expect(page.locator('text=1 active')).toBeVisible()

    // Toggle back on
    const offButton = page.locator('button', { hasText: 'Off' }).last()
    await offButton.click()

    // Verify toggle switched back to "On"
    await expect(page.locator('button', { hasText: 'On' }).last()).toBeVisible()

    // Verify slider is enabled
    await expect(slider).not.toBeDisabled()

    // Verify threshold was preserved at 75%
    await expect(page.locator('text=75%')).toBeVisible()

    // Verify confidence filter tag is back
    await expect(page.locator('text=Confidence:').locator('text=>=75%')).toBeVisible()
  })

  test('should generate correct URL with Copy link button', async ({ page }) => {
    // Set up specific filter state
    // hasDeer=true (default), minConfidence=65
    const slider = page.locator('input[type="range"]').last()
    await slider.fill('65')

    // Wait for update
    await page.waitForTimeout(200)

    // Mock clipboard API to capture copied URL
    await page.evaluate(() => {
      (window as any).__clipboardText = ''
      Object.assign(navigator, {
        clipboard: {
          writeText: (text: string) => {
            (window as any).__clipboardText = text
            return Promise.resolve()
          },
        },
      })
    })

    // Click "Copy link" button
    const copyButton = page.locator('button', { hasText: 'Copy link' })
    await copyButton.click()

    // Get the copied URL
    const copiedUrl = await page.evaluate(() => (window as any).__clipboardText)

    // Verify URL contains correct query parameters
    expect(copiedUrl).toContain('/photos?')
    expect(copiedUrl).toContain('hasDeer=true')
    expect(copiedUrl).toContain('minConfidence=65')

    // Verify URL structure
    const url = new URL(copiedUrl)
    expect(url.searchParams.get('hasDeer')).toBe('true')
    expect(url.searchParams.get('minConfidence')).toBe('65')
  })

  test('should restore filter state from URL params', async ({ page }) => {
    // Navigate to photos page with specific URL params
    await page.goto('/photos?hasDeer=true&minConfidence=85&status=completed')

    // Wait for filters to render
    await page.waitForSelector('text=Filters')

    // Verify hasDeer filter is applied
    const hasDeerButton = page.locator('button', { hasText: 'Has Deer' })
    await expect(hasDeerButton).toHaveAttribute('data-variant', 'default')

    // Verify confidence threshold is 85%
    await expect(page.locator('text=85%')).toBeVisible()

    // Verify confidence filter is ON
    const confidenceToggle = page.locator('button', { hasText: 'On' }).last()
    await expect(confidenceToggle).toBeVisible()

    // Verify status filter is applied
    const statusButton = page.locator('button', { hasText: 'Completed' })
    await expect(statusButton).toHaveAttribute('data-variant', 'default')

    // Verify active filters count
    await expect(page.locator('text=3 active')).toBeVisible()

    // Verify active filter tags
    await expect(page.locator('text=Has Deer')).toBeVisible()
    await expect(page.locator('text=Confidence:').locator('text=>=85%')).toBeVisible()
    await expect(page.locator('text=Status:').locator('text=completed')).toBeVisible()
  })

  test('should handle shared URL with no filters (filters disabled)', async ({ page }) => {
    // Navigate to photos page with hasDeer=false (explicitly)
    // This tests that URL params override defaults
    await page.goto('/photos?hasDeer=false')

    // Wait for filters to render
    await page.waitForSelector('text=Filters')

    // Verify "Empty" button is selected instead of "Has Deer"
    const emptyButton = page.locator('button', { hasText: 'Empty' })
    await expect(emptyButton).toHaveAttribute('data-variant', 'default')

    // Verify confidence filter is OFF (no URL param means undefined)
    const confidenceOffButton = page.locator('button', { hasText: 'Off' }).last()
    await expect(confidenceOffButton).toBeVisible()

    // Verify only 1 active filter (hasDeer=false)
    await expect(page.locator('text=1 active')).toBeVisible()
  })

  test('should clear all filters when Clear all button is clicked', async ({ page }) => {
    // Set up some filters
    await page.locator('button', { hasText: 'Has Deer' }).click()
    const slider = page.locator('input[type="range"]').last()
    await slider.fill('70')

    // Verify filters are active
    await expect(page.locator('text=2 active')).toBeVisible()

    // Click "Clear all" button
    const clearButton = page.locator('button', { hasText: 'Clear all' })
    await clearButton.click()

    // Verify all filters are cleared
    // hasDeer should be null (All selected)
    const allButton = page.locator('button', { hasText: 'All' }).first()
    await expect(allButton).toHaveAttribute('data-variant', 'default')

    // Confidence filter should be OFF
    await expect(page.locator('button', { hasText: 'Off' }).last()).toBeVisible()

    // No active filters badge
    await expect(page.locator('text=active')).not.toBeVisible()

    // Clear all button should not be visible
    await expect(clearButton).not.toBeVisible()
  })

  test('should update URL when filters change (without navigation)', async ({ page }) => {
    // Adjust confidence slider
    const slider = page.locator('input[type="range"]').last()
    await slider.fill('60')

    // Note: The current implementation doesn't update the URL on filter change
    // This test documents expected behavior if we add URL syncing
    // For now, we verify that the filter state is maintained in component state

    // Verify filter state is reflected in UI
    await expect(page.locator('text=60%')).toBeVisible()

    // Copy link should generate correct URL
    await page.evaluate(() => {
      (window as any).__clipboardText = ''
      Object.assign(navigator, {
        clipboard: {
          writeText: (text: string) => {
            (window as any).__clipboardText = text
            return Promise.resolve()
          },
        },
      })
    })

    const copyButton = page.locator('button', { hasText: 'Copy link' })
    await copyButton.click()

    const copiedUrl = await page.evaluate(() => (window as any).__clipboardText)
    expect(copiedUrl).toContain('minConfidence=60')
  })

  test('should disable slider when confidence filter is off', async ({ page }) => {
    // Toggle confidence filter off
    const toggleButton = page.locator('button', { hasText: 'On' }).last()
    await toggleButton.click()

    // Verify slider is disabled
    const slider = page.locator('input[type="range"]').last()
    await expect(slider).toBeDisabled()

    // Verify slider still shows last value visually (but disabled)
    const sliderValue = await slider.getAttribute('value')
    expect(parseInt(sliderValue || '0')).toBeGreaterThan(0)
  })

  test('should handle edge cases: 0% and 100% confidence', async ({ page }) => {
    const slider = page.locator('input[type="range"]').last()

    // Test 0% (minimum)
    await slider.fill('0')
    await expect(page.locator('text=0%')).toBeVisible()
    await expect(page.locator('text=Confidence:').locator('text=>=0%')).toBeVisible()

    // Test 100% (maximum)
    await slider.fill('100')
    await expect(page.locator('text=100%')).toBeVisible()
    await expect(page.locator('text=Confidence:').locator('text=>=100%')).toBeVisible()
  })

  test('should combine confidence filter with other filters', async ({ page }) => {
    // Apply multiple filters
    await page.locator('button', { hasText: 'Completed' }).click()
    await page.locator('button', { hasText: 'Has Deer' }).click()

    const slider = page.locator('input[type="range"]').last()
    await slider.fill('70')

    // Verify multiple active filters
    await expect(page.locator('text=3 active')).toBeVisible()

    // Verify all filter tags are shown
    await expect(page.locator('text=Status:').locator('text=completed')).toBeVisible()
    await expect(page.locator('text=Has Deer')).toBeVisible()
    await expect(page.locator('text=Confidence:').locator('text=>=70%')).toBeVisible()

    // Copy link should include all filters
    await page.evaluate(() => {
      (window as any).__clipboardText = ''
      Object.assign(navigator, {
        clipboard: {
          writeText: (text: string) => {
            (window as any).__clipboardText = text
            return Promise.resolve()
          },
        },
      })
    })

    const copyButton = page.locator('button', { hasText: 'Copy link' })
    await copyButton.click()

    const copiedUrl = await page.evaluate(() => (window as any).__clipboardText)
    expect(copiedUrl).toContain('status=completed')
    expect(copiedUrl).toContain('hasDeer=true')
    expect(copiedUrl).toContain('minConfidence=70')
  })
})
