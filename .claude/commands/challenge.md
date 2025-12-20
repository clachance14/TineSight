---
name: challenge
description: Devil's advocate review - assume solution is wrong, find failure modes, propose fixes
argument-hint: "[optional: specific area to focus on]"
---

# Challenge Solution

Perform a pre-mortem analysis on the solution discussed above. Assume it will fail and work backwards to identify why.

## Analysis Framework

### Step 1: Assume Failure

The solution above is wrong. Do not defend it - find its weaknesses.

Think hard about:
- What could go wrong in production?
- What edge cases were missed?
- What assumptions are being made implicitly?

### Step 2: List Top 5 Failure Reasons

Identify the **5 most likely reasons** this solution will fail in production:

1. **[Failure Mode]** - Concrete scenario where this breaks
2. **[Failure Mode]** - Concrete scenario where this breaks
3. **[Failure Mode]** - Concrete scenario where this breaks
4. **[Failure Mode]** - Concrete scenario where this breaks
5. **[Failure Mode]** - Concrete scenario where this breaks

For each failure mode:
- Describe the specific trigger condition
- Explain the impact (data loss, UX degradation, security issue, etc.)
- Estimate likelihood (common, occasional, rare but catastrophic)

### Step 3: Identify Weakest Assumptions

List the assumptions this solution makes, then rank them by fragility:

| Assumption | Why It's Weak | What Breaks If Wrong |
|------------|---------------|----------------------|
| ... | ... | ... |

Focus on:
- Assumptions about user behavior
- Assumptions about data shape/volume
- Assumptions about infrastructure/timing
- Assumptions about third-party services
- Assumptions about concurrent access

### Step 4: Propose Revised Solution

Based on the identified risks, propose a revised solution that:

1. **Addresses the top failure modes** - Specific mitigations for each
2. **Validates weak assumptions** - Add guards, checks, or fallbacks
3. **Fails gracefully** - What happens when things go wrong?
4. **Is testable** - How would you verify the fix works?

Present the revised solution clearly, highlighting what changed and why.

$ARGUMENTS

## Output Format

Structure your response as:

```
## Top 5 Failure Reasons

1. **[Name]**: [Description]
   - Trigger: ...
   - Impact: ...
   - Likelihood: ...

[repeat for 2-5]

## Weakest Assumptions

| Assumption | Fragility | Consequence |
|------------|-----------|-------------|
| ... | ... | ... |

## Revised Solution

[Clear description of the improved approach]

### Key Changes
- [Change 1]: Addresses [failure mode/assumption]
- [Change 2]: Addresses [failure mode/assumption]
...

### Trade-offs
- [What this costs in complexity/performance/etc.]
```
