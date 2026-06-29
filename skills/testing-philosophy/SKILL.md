---
name: testing-philosophy
description: |
  Core testing philosophy for TypeScript applications: behavior-based testing,
  integration over unit, and the Two Users principle.
  Use when writing tests, reviewing test quality, or assessing test coverage.
---

# Testing Philosophy

## The Cardinal Rule

**Every test must answer: "What user-visible behavior does this verify?"**

If you cannot articulate the user-facing value in one sentence, do not write the test.

## The Two Users Principle

Every component/module has exactly two users:

1. **End User**: Interacts with the rendered UI or uses the API output
2. **Developer User**: Calls the function/renders the component

**NEVER create a third "test user"** that observes implementation details.

### User-Observable Behavior (SHOULD break tests)

- What the end user sees (rendered content, error messages)
- What the end user can do (interactions, form submissions)
- What the developer receives (return values, thrown errors, callbacks)
- Side effects that matter (database writes, API calls made)

### Implementation Details (should NOT break tests)

- How logic is organized internally
- Which helper functions are called
- Internal state management
- Component structure or hook usage

## Testing Trophy (not Pyramid)

```
       /\
      /  \    E2E (Few)
     /----\
    /      \  Integration (Most)
   /--------\
  /          \ Unit (Some)
 /------------\
/______________\ Static Analysis (TypeScript, ESLint)
```

**Priority**: Static Analysis → Integration → Unit → E2E

## Write Tests. Not Too Many. Mostly Integration.

**Write tests** for confidence, not coverage:
- Tests should prevent bugs from reaching production
- Focus on business logic and user workflows
- Static typing (TypeScript) and linting handle many bugs already

**Not too many**:
- Avoid mandating 100% code coverage
- Diminishing returns beyond ~70% coverage
- Testing trivial code wastes time and slows refactoring

**Mostly integration**:
- Integration tests provide the best confidence-to-cost ratio
- Test components working together, not in isolation
- Stop mocking excessively—mocking removes integration confidence

## Mocking Boundaries

**Only mock at external boundaries:**
- External APIs (AI services, third-party APIs)
- Network requests (use MSW)
- File system operations
- Time-dependent operations

**Never mock:**
- Components you control
- Internal modules/services
- Hooks within the same codebase

See [examples.md](examples.md) for good vs bad test patterns.
