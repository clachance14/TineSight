---
name: review
description: Perform CodeRabbit-style code review on uncommitted changes (staged + unstaged)
argument-hint: "[optional: focus area - security|performance|typescript|all]"
---

# Code Review

Perform a comprehensive CodeRabbit-style code review on all uncommitted changes (both staged and unstaged).

## User Input

```text
$ARGUMENTS
```

If arguments specify a focus area (security, performance, typescript, or all), prioritize that category in your review.

## Step 1: Gather Changes

Get all uncommitted changes using git:

```bash
# Get staged changes
git diff --cached --unified=5

# Get unstaged changes
git diff --unified=5

# Get list of untracked files
git status --porcelain | grep '^??' | cut -c4-
```

If no changes are found (empty diff output), respond with:
```
No uncommitted changes found. Nothing to review.

REVIEW_RESULT: PASS
```
And exit.

## Step 2: Analyze Context

For each modified file, also read:
1. The full current file content to understand context
2. Related files (imports, shared types) if needed for understanding

Use `Read` tool for files, limit to files directly related to changes.

## Step 3: Review Categories

Review changes against these categories, assigning appropriate severity:

### Security (Priority 1)
- **Injection vulnerabilities**: SQL injection, command injection, XSS
- **Secrets exposure**: API keys, passwords, tokens in code or comments
- **Authentication/Authorization issues**: Missing auth checks, improper session handling
- **Insecure data handling**: Unvalidated input, improper sanitization
- **CORS/CSRF issues**: Missing or misconfigured security headers
- **Supabase RLS bypass**: Direct database calls without RLS, missing policies
- **Environment variables**: Secrets in client-side code (NEXT_PUBLIC_ misuse)

### Logic Bugs (Priority 2)
- **Edge cases**: Null/undefined handling, empty arrays, boundary conditions
- **Race conditions**: Async/await issues, state management bugs
- **Type coercion issues**: Truthy/falsy checks, equality comparisons
- **Off-by-one errors**: Loop bounds, array indexing
- **Error handling**: Missing try/catch, unhandled promise rejections
- **State mutations**: Unexpected object/array mutations

### Performance (Priority 3)
- **N+1 queries**: Database queries in loops
- **Memory leaks**: Uncleared intervals, missing cleanup in useEffect
- **Unnecessary re-renders**: Missing React.memo, unstable references in deps
- **Bundle size**: Large imports that could be tree-shaken
- **Inefficient algorithms**: O(n^2) where O(n) is possible

### TypeScript/React Best Practices (Priority 4)
- **Type safety**: Use of `any`, missing type annotations
- **Strict mode violations**: Based on project's eslint rules
- **Hook rules**: Conditional hooks, missing dependencies
- **Component patterns**: Missing error boundaries, prop drilling
- **Import organization**: Circular dependencies, type-only imports

### Code Style (Priority 5)
- **Naming conventions**: Inconsistent naming, unclear variable names
- **Code duplication**: Repeated patterns that should be extracted
- **Documentation**: Missing JSDoc for public APIs
- **File organization**: Components in wrong directories

### Test Coverage
TineSight follows Constitution P5 (**integration testing over unit testing**). Per ADR 0002, the verification path is `npm run test:unit` (node:test for pure logic in `lib/**/*.test.ts`) plus gstack browser QA + performance/memory budgets for flows. There is no Playwright/Vitest. Calibrate test suggestions accordingly:
- **Missing flow coverage**: New user-facing flows without gstack browser QA coverage (prefer this over unit tests)
- **Incomplete assertions**: Tests that don't verify all behavior
- **Test anti-patterns**: Testing implementation instead of behavior
- Do NOT flag pure-logic helpers as "untested" against a Vitest suite that doesn't exist yet

## Step 4: Generate Report

Structure your report as follows:

### Summary

```markdown
## Code Review Summary

**Files Reviewed**: [count]
**Changes Analyzed**: +[additions] -[deletions]
**Verdict**: PASS | FAIL (FAIL if any Critical issues)

| Severity | Count |
|----------|-------|
| Critical | [n]   |
| Warning  | [n]   |
| Suggestion | [n] |
```

### Issues (grouped by severity, then by file)

For each issue:

```markdown
### [emoji] [Severity]: [Brief Title]

**File**: `path/to/file.ts` (lines X-Y)
**Category**: [Security|Logic|Performance|TypeScript|Style|Tests]

**Issue**:
[Clear explanation of the problem]

**Code**:
```[language]
[Relevant code snippet from the diff]
```

**Suggested Fix**:
```[language]
[Corrected code or approach]
```

**Why This Matters**:
[Brief explanation of the risk/impact]
```

### Severity Levels

Use these emoji and definitions:

- **Critical** (blocks commit): Security vulnerabilities, data loss risks, breaking bugs
- **Warning** (should fix soon): Logic issues, performance problems, missing error handling
- **Suggestion** (nice to have): Style improvements, minor optimizations, documentation

### Final Verdict

End with a clear verdict for pre-commit hook integration:

```markdown
---

## Verdict

**RESULT**: [PASS|FAIL]

[If FAIL]:
This commit is blocked due to [n] critical issue(s). Please address the following before committing:
1. [Critical issue 1 brief]
2. [Critical issue 2 brief]
...

[If PASS with warnings]:
Commit may proceed, but consider addressing [n] warning(s) before merging.

[If PASS clean]:
Commit approved. No significant issues found.
```

**IMPORTANT**: Always end with exactly one of these lines on its own line:
- `REVIEW_RESULT: PASS`
- `REVIEW_RESULT: FAIL`

## Step 5: Handle Large Diffs

If the combined diff exceeds 50KB or 2000 lines:

1. **Prioritize**: Focus on:
   - New files (most likely to have issues)
   - Files with security-sensitive patterns (auth, API, database)
   - Files with complex logic changes (more than cosmetic)

2. **Summarize**: For files you skip:
   ```markdown
   ### Skipped Files (Large Diff)

   The following files were not fully reviewed due to diff size limits:
   - `path/to/file1.ts` - [brief reason for skipping]
   - `path/to/file2.ts` - [brief reason for skipping]

   Consider running `/review` on these files individually.
   ```

3. **Token Management**: If approaching limits, prioritize Critical and Warning issues over Suggestions.

## Project-Specific Considerations

Based on TineSight's constitution and patterns:

### Supabase/RLS Checks
- Verify all database access uses service layer (`lib/services/*.ts`)
- Check for RLS policy compliance on new tables
- Ensure `getUser()` is used, not deprecated `getSession()`

### TypeScript Strict Mode
- Enforce rules from `eslint.config.mjs`
- Check for proper type imports (use `type` keyword)

### React Patterns
- Server Components for initial load, TanStack Query for mutations
- Zustand for client state, not prop drilling
- shadcn/ui components with TineSight theme

### Environment Variables
- No secrets in NEXT_PUBLIC_ variables
- Scripts must import `./env.mjs` first
