# E2E Test Setup Instructions

This document provides instructions for setting up and running the E2E tests for TineSight.

## Installation

1. **Install Playwright**

```bash
npm install -D @playwright/test
```

2. **Install Playwright browsers**

```bash
npx playwright install --with-deps
```

3. **Add test scripts to package.json**

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:report": "playwright show-report"
  }
}
```

## Environment Setup

Create a `.env.test` file for test-specific environment variables:

```bash
# Test user credentials
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=testpassword123

# Supabase (same as .env.local but for testing)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Playwright
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000
```

## Running Tests

### Run all tests

```bash
npm run test:e2e
```

### Run tests in UI mode (recommended for development)

```bash
npm run test:e2e:ui
```

### Run specific test file

```bash
npx playwright test photo-filters.spec.ts
```

### Run tests in headed mode (see the browser)

```bash
npm run test:e2e:headed
```

### Debug tests

```bash
npm run test:e2e:debug
```

### View test report

```bash
npm run test:e2e:report
```

## Test Data Setup

The photo filter tests require test data to be present. You have two options:

### Option 1: Use existing data

If you already have photos in your development database, the tests will use those. Make sure you have:
- Photos with various confidence levels (0-100)
- Photos with `has_deer` classification
- Photos with `empty` classification

### Option 2: Seed test data

Create a test data seeding script:

```bash
node scripts/seed-test-data.mjs
```

This script should create test photos with varying confidence levels for comprehensive testing.

## CI/CD Integration

### GitHub Actions

Add this workflow to `.github/workflows/e2e-tests.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

## Test Components Added

The following components were updated to support E2E testing:

1. **PhotoCard** (`components/photos/photo-card.tsx`)
   - Added `data-testid="photo-card"` attribute

2. **Button** (`components/ui/button.tsx`)
   - Added `data-variant={variant}` attribute for testing button states

## Troubleshooting

### Tests fail with "Authentication required"

Make sure you're logged in before tests run. Update the `beforeEach` hook in test files:

```typescript
test.beforeEach(async ({ page }) => {
  // Add authentication
  await authenticateUser(page, {
    email: process.env.TEST_USER_EMAIL || 'test@example.com',
    password: process.env.TEST_USER_PASSWORD || 'testpassword123',
  })

  await page.goto('/photos')
  await page.waitForSelector('text=Filters')
})
```

### Tests fail to find elements

1. Check that the app is running on the correct URL (default: `http://localhost:3000`)
2. Verify that components have the required `data-testid` attributes
3. Use Playwright UI mode (`npm run test:e2e:ui`) to inspect the page

### Slow test execution

1. Run tests in headed mode to see what's happening: `npm run test:e2e:headed`
2. Use `page.waitForTimeout()` sparingly - prefer `waitForSelector` or `waitForLoadState`
3. Consider running only specific tests during development

### Tests pass locally but fail in CI

1. Check that all environment variables are set in CI
2. Verify that the test database is properly seeded
3. Increase timeouts for CI environment (network may be slower)

## Best Practices

1. **Use Page Object Model** - Encapsulate page interactions in helper functions
2. **Avoid hard-coded waits** - Use Playwright's built-in waiting mechanisms
3. **Clean up test data** - Use `afterEach` hooks to clean up created data
4. **Run tests in isolation** - Each test should be independent
5. **Use descriptive test names** - Make it clear what each test is verifying

## Next Steps

After setting up the tests:

1. Add more E2E tests for other features (upload, photo viewer, etc.)
2. Set up visual regression testing with Playwright's screenshot comparison
3. Add performance testing to measure page load times
4. Integrate with your CI/CD pipeline
5. Set up test reporting and monitoring
