# Testing Philosophy Examples

## Good vs Bad: User-Observable Behavior

### ❌ Bad: Testing Implementation Details

```typescript
// Testing CSS classes
expect(element).toHaveClass("opacity-50");
expect(element).toHaveClass("cursor-not-allowed");

// Testing internal state
const { result } = renderHook(() => useUpload());
act(() => result.current.startUpload());
expect(result.current.isLoading).toBe(true);

// Testing hook memoization
const { result, rerender } = renderHook(() => useFileSelection());
const firstRef = result.current.handleFileSelect;
rerender();
expect(result.current.handleFileSelect).toBe(firstRef);

// Testing hidden form inputs
expect(document.querySelector('input[name="campaignId"]')).toBeInTheDocument();
```

### ✅ Good: Testing User-Observable Behavior

```typescript
// Test the behavior the styling represents
expect(submitButton).toBeDisabled();
expect(screen.getByRole("button")).toHaveAttribute("aria-disabled", "true");

// Test what the user sees during loading
expect(screen.getByRole("progressbar")).toBeInTheDocument();
expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled();

// Test the outcome, not the mechanism
await user.upload(screen.getByLabelText(/upload/i), testFile);
expect(screen.getByText(/upload complete/i)).toBeInTheDocument();
```

## Good vs Bad: Mocking

### ❌ Bad: Mocking Components You Control

```typescript
// Mocking internal components destroys integration confidence
vi.mock("../EntityMatchSection", () => ({ default: () => <div>Mock</div> }));
vi.mock("../EntityNameEditor", () => ({ default: () => <div>Mock</div> }));
vi.mock("@/components/Button", () => ({ Button: () => <button>Mock</button> }));

// Mocking the thing you're testing
jest.mock('../processSession', () => ({
  processSession: jest.fn(() => ({ success: true }))
}));

test('processes session', async () => {
  await processSession(data);
  expect(processSession).toHaveBeenCalled();  // Meaningless!
});
```

### ✅ Good: Mocking Only External Boundaries

```typescript
// Mock external APIs with MSW
import { server } from "@/mocks/node";
import { http, HttpResponse } from "msw";

beforeEach(() => {
  server.use(
    http.get("/api/entities", () => HttpResponse.json({ entities: mockData }))
  );
});

it("displays entity matches from API", async () => {
  render(<EntityReviewCard entity={testEntity} />); // Real child components
  await screen.findByText("Matched Entity Name");
});

// Mock external boundary, test real logic
server.use(http.post('/api/transcribe', () => HttpResponse.json({ text: '...' })));

test('processes session', async () => {
  const result = await processSession(data);
  expect(result.transcript).toBeDefined();
});
```

## Good vs Bad: Test Scope

### ❌ Bad: Over-Granular Component Tests

```typescript
// Separate test files for tightly-coupled components
// - EntityActionButtons.test.tsx (20 tests)
// - EntityCardHeader.test.tsx (15 tests)
// - EntityNameEditor.test.tsx (12 tests)
// - EntityMatchSection.test.tsx (10 tests)

// Testing static display text
it("displays supported file formats", () => {
  render(<FileUpload />);
  expect(screen.getByText(".m4a, .mp3, .wav")).toBeInTheDocument();
});
```

### ✅ Good: Workflow-Based Integration Tests

```typescript
// One test file per user workflow: EntityReview.test.tsx
describe("EntityReview", () => {
  it("user reviews entity, edits name, and accepts", async () => {
    const user = userEvent.setup();
    render(<EntityReviewCard entity={proposedEntity} />);

    // User sees proposal
    expect(screen.getByText("Suggested: Goblin Chief")).toBeInTheDocument();

    // User edits name
    await user.click(screen.getByRole("button", { name: /edit/i }));
    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), "Goblin Warlord");

    // User accepts
    await user.click(screen.getByRole("button", { name: /accept/i }));

    // User sees confirmation
    expect(screen.getByText(/accepted/i)).toBeInTheDocument();
  });

  it("rejects unsupported file types with actionable error", async () => {
    const user = userEvent.setup();
    render(<FileUpload />);

    const file = new File(["content"], "document.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/upload/i), file);

    expect(screen.getByRole("alert")).toHaveTextContent(/not a supported format/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
```

## Test User Detection Checklist

Before writing any test, verify it passes ALL of these:

- [ ] Does a real user see/experience this? (visible text, feedback, enabled/disabled state)
- [ ] Does a developer need this for the component API? (props, callbacks, errors)
- [ ] Would this test still pass if I completely rewrote the implementation?
- [ ] Am I testing behavior or structure?

If any answer is "no," do not write the test.

## Good Test Resilience

**NOT all "test still passes" = bad test!**

A test continuing to pass after implementation-only changes is **correct behavior**:

```typescript
// Implementation change (same behavior):
- const name = user.firstName + ' ' + user.lastName
+ const name = formatUserName(user)

// Test correctly unchanged:
expect(screen.getByText('John Doe')).toBeInTheDocument()
```

This is proper isolation from implementation details.
