import { Page } from '@playwright/test'

/**
 * Authentication helpers for E2E tests
 *
 * These helpers set up authenticated sessions for testing protected pages.
 */

export interface TestUser {
  email: string
  password: string
}

/**
 * Sets up an authenticated session by logging in via the UI
 *
 * @param page - Playwright page object
 * @param user - Test user credentials (optional, uses defaults)
 */
export async function authenticateUser(
  page: Page,
  user?: TestUser
): Promise<void> {
  const testUser = user || {
    email: process.env.TEST_USER_EMAIL || 'test@example.com',
    password: process.env.TEST_USER_PASSWORD || 'testpassword123',
  }

  // Navigate to login page
  await page.goto('/login')

  // Fill in login form
  await page.fill('input[type="email"]', testUser.email)
  await page.fill('input[type="password"]', testUser.password)

  // Submit form
  await page.click('button[type="submit"]')

  // Wait for redirect to dashboard (successful login)
  await page.waitForURL('/dashboard', { timeout: 10000 })
}

/**
 * Sets up an authenticated session using Supabase session cookies
 *
 * This is faster than logging in via UI but requires access to Supabase session data.
 * Use this for most tests to improve speed.
 *
 * @param page - Playwright page object
 * @param sessionData - Supabase session data (from createClient().auth.session)
 */
export async function setAuthCookies(
  page: Page,
  sessionData: { access_token: string; refresh_token: string }
): Promise<void> {
  // Set Supabase auth cookies
  await page.context().addCookies([
    {
      name: 'sb-access-token',
      value: sessionData.access_token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'sb-refresh-token',
      value: sessionData.refresh_token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ])

  // Navigate to any protected page to verify auth
  await page.goto('/dashboard')
}

/**
 * Creates a test user account (for setup/teardown in tests)
 *
 * Note: This requires the Supabase service role key and should only be used
 * in test environments.
 *
 * @param email - User email
 * @param password - User password
 */
export async function createTestUser(
  email: string,
  password: string
): Promise<{ userId: string; email: string }> {
  // This would call your Supabase admin API to create a test user
  // Implementation depends on your auth setup
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
      }),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`Failed to create test user: ${data.message}`)
  }

  return {
    userId: data.id,
    email: data.email,
  }
}

/**
 * Deletes a test user account (for cleanup)
 *
 * @param userId - User ID to delete
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
    }
  )

  if (!response.ok) {
    const data = await response.json()
    throw new Error(`Failed to delete test user: ${data.message}`)
  }
}

/**
 * Clears authentication cookies and session storage
 *
 * @param page - Playwright page object
 */
export async function clearAuth(page: Page): Promise<void> {
  // Clear cookies
  await page.context().clearCookies()

  // Clear session/local storage
  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.clear()
  })
}
