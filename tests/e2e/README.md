# E2E Tests

End-to-end tests for TineSight using Playwright.

## Setup

Install Playwright and browsers:

```bash
npm install -D @playwright/test
npx playwright install
```

## Running Tests

Run all E2E tests:

```bash
npx playwright test
```

Run tests in UI mode (interactive):

```bash
npx playwright test --ui
```

Run specific test file:

```bash
npx playwright test photo-filters.spec.ts
```

Run tests in headed mode (see browser):

```bash
npx playwright test --headed
```

Debug tests:

```bash
npx playwright test --debug
```

## Test Reports

View last test report:

```bash
npx playwright show-report
```

## Photo Filter Tests

The `photo-filters.spec.ts` file tests the confidence filter functionality:

### Test Coverage

1. **Default filters on page load** - Verifies hasDeer=true and minConfidence=50 are applied by default
2. **Slider adjustments** - Tests that moving the slider updates the confidence threshold and photo results
3. **Toggle filter on/off** - Verifies the filter can be disabled/enabled while preserving the threshold value
4. **Copy link button** - Tests that the "Copy link" button generates URLs with correct query parameters
5. **URL parameter restoration** - Verifies that shared URLs restore the exact filter state
6. **Clear all filters** - Tests the "Clear all" button removes all active filters
7. **Edge cases** - Tests 0% and 100% confidence values
8. **Combined filters** - Verifies confidence filter works correctly with other filters

### Key Test Patterns

- **Data Attributes**: Tests use `data-testid` attributes for stable selectors (ensure these are added to components)
- **Variant Checking**: Tests verify button states using `data-variant` attribute from shadcn/ui
- **Clipboard Mocking**: Tests mock `navigator.clipboard.writeText` to capture copied URLs
- **Wait Strategies**: Tests use appropriate waits for async operations (TanStack Query refetch)

### Prerequisites

These tests assume:

- The app is running on `http://localhost:3000` (configured in `playwright.config.ts`)
- User is authenticated (you may need to add auth setup in `beforeEach`)
- Photos exist in the database for testing filters
- Components use `data-testid` attributes for reliable selection

### Adding Data Test IDs

For these tests to work reliably, add data-testid attributes to components:

```tsx
// PhotoCard component
<div data-testid="photo-card">...</div>

// PhotoFilters component buttons
<Button data-variant={variant}>...</Button>
```

## CI Integration

Tests are configured to run in CI with:

- 2 retries on failure
- HTML and GitHub reporters
- Sequential execution (workers: 1)
- Video and screenshots on failure

Add to your CI workflow:

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npx playwright test

- name: Upload test results
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Debugging Tips

1. **Use Playwright Inspector**: `npx playwright test --debug`
2. **Use UI Mode**: `npx playwright test --ui` for visual test running
3. **Add `await page.pause()`**: Pause test execution at specific points
4. **Check screenshots**: Failed tests automatically capture screenshots
5. **Use trace viewer**: `npx playwright show-trace trace.zip`

## Best Practices

- Keep tests focused on user behavior, not implementation details
- Use semantic selectors (text, labels) when possible
- Use `data-testid` for dynamic or complex components
- Mock external dependencies (clipboard, network)
- Test realistic user workflows, not just individual actions
- Avoid hard-coded waits - use `waitForSelector`, `waitForLoadState`, etc.
