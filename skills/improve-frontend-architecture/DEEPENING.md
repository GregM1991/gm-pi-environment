# Deepening

How to deepen a cluster of shallow frontend modules safely, given its dependencies. Assumes the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **Module**, **Interface**, **Seam**, **Adapter**, **Leverage**, and **Locality**.

## Dependency categories

When assessing a frontend candidate for deepening, classify its dependencies. The category determines where the Seam should live and how the deepened Module is tested.

### 1. In-process

Pure rendering, formatting, presenter logic, derived view state, in-memory state, and deterministic reducers. Always deepenable — move behaviour behind the Module Interface and test through that Interface directly. No Adapter needed.

Examples:

- status-to-label/icon/color/action mapping
- artifact availability view models
- table sorting/filtering state
- conditional rendering rules
- form field display derivations

### 2. React-local

Dependencies that are local to React but not pure: hooks, context, refs, focus state, disclosure state, pending UI state, and controlled/uncontrolled input state. Deepenable when the Module can own the lifecycle and expose a smaller Interface.

Test through user-visible behaviour and developer-visible returns. Avoid exposing setters or internal refs unless callers truly need them.

Examples:

- `useFileSelection` hiding file validation and selected-file state
- a dialog Module owning open/close/focus behaviour
- a review card Module owning edit/accept/skip mode transitions
- a panel Module owning loading/error/empty branches

### 3. Route-provided

Dependencies supplied by route params, loader data, outlet context, or route actions. Deepenable by keeping the Route Module as the composition point and moving feature behaviour into a UI, Hook, Form, or Presenter Module.

The route should pass domain inputs, not implementation facts. Prefer Interfaces like:

```tsx
<SessionArtifactsPanel sessionId={sessionId} campaignId={campaignId} sessionName={session.name} />
```

rather than making the route own artifact config, download logic, status mapping, and browser behaviour.

### 4. Data-fetching

Dependencies on query clients, tRPC clients, fetchers, loaders, or remote data. Deepenable in two common shapes:

1. **Container UI Module owns data fetching** — good when the feature is route-local and callers should not know query details.
2. **Hook Module owns data fetching** — good when rendering and behaviour need to be separated or reused.

Do not create a broad Adapter just because a query exists. A Seam is real when you need at least production + test/fake behaviour, or multiple production data sources.

Examples:

- a session artifacts Hook Module that owns metadata queries and content download
- a campaign search Module that owns result grouping and navigation targets
- a review list Module that owns fetcher submission state and optimistic UI

### 5. Form/action

Dependencies on form libraries, schemas, action responses, fetcher forms, validation errors, dirty state, and submit buttons. Deepenable by making a Form Module own the user-facing lifecycle.

A good Form Module Interface hides:

- default value shaping
- field wiring
- validation display
- expected failure rendering
- pending/disabled states
- submit action names
- success/error messaging

The route action may still own server mutation. The frontend Form Module owns how users interact with that mutation.

### 6. Browser/platform

Dependencies on DOM APIs, Blob downloads, clipboard, local storage, media playback, drag/drop, resize observers, scroll, focus, and keyboard events. Deepenable by putting browser-specific behaviour behind a small UI or Hook Module Interface.

Tests should generally use user events and observable outcomes. If the platform API is hard to exercise, use a narrow Adapter or test fake at the Seam.

Examples:

- artifact download Blob creation
- copy-to-clipboard buttons
- audio playback controls
- drag/drop upload selection
- focus restoration after dialog close

### 7. Design-system primitives

Dependencies on shared primitives such as Button, Dialog, Combobox, Field, Popover, Badge, or Card. Deepenable when product-specific behaviour is repeated on top of primitives.

Do not wrap primitives just to rename props. Create a deeper Module when the wrapper owns product rules, accessibility obligations, visual states, or interaction policy.

Examples:

- `SessionStatusBadge` as a Presenter/UI Module
- `EntityPicker` over a Combobox primitive
- `ReviewActionButtons` over Button primitives
- `ExpectedFailureAlert` over Alert primitives

### 8. True external

Third-party widgets, analytics, maps, payment widgets, auth widgets, or SDK-backed UI. The deepened Module should take the external dependency as an injected or isolated Adapter when tests or alternate implementations need it.

Mock at this Seam only when the dependency is truly external. Do not mock internal UI Modules you control.

## Seam discipline

- **One Adapter = hypothetical Seam. Two Adapters = real Seam.** Do not introduce a port/factory/render-prop seam unless real variation exists.
- **Internal Seams vs external Seams.** A deep frontend Module can have internal hooks/helpers used by its Implementation and tests. Do not expose those internal Seams to callers just because tests use them.
- **Route-local can still be deep.** A Module does not need multiple callers to be worth extracting. If it concentrates feature behaviour and simplifies the Route Module, it may be deep even with one caller.
- **Accessibility belongs somewhere.** If every caller must remember aria labels, focus handling, keyboard behaviour, or announcement rules, move that obligation behind the Module Interface.
- **Presenter logic is behaviour.** Status-to-label/icon/color/action mappings are not harmless display details when users rely on them. Centralize them when they encode product rules.

## Testing strategy: replace, don't layer

- Old tests on shallow extracted helpers become waste once tests at the deepened Module Interface exist — delete or rewrite them.
- Write tests at the same Seam callers use. The **Interface is the test surface**.
- Prefer user-observable assertions: text, roles, labels, enabled/disabled state, navigation targets, submitted form data, visible errors, and callbacks received by developer callers.
- Do not assert on hook internals, component structure, helper calls, or private state transitions unless those are the Interface.
- Tests should survive internal refactors. If changing the Implementation requires changing the test but user/developer behaviour did not change, the test is probably past the Interface.

## Deepening shapes

Common frontend deepening shapes:

1. **Route Module → Panel UI Module**
   - Use when a route owns feature rendering and interaction rules inline.

2. **Route Module → Hook Module + UI Module**
   - Use when behaviour and rendering have separate reasons to change or need separate tests.

3. **Repeated conditionals → Presenter Module**
   - Use when status/type/state mapping appears in multiple places.

4. **Inline form lifecycle → Form Module**
   - Use when a route or card owns validation display, pending state, action names, and field composition.

5. **Browser logic inline → Platform Hook Module**
   - Use when Blob, clipboard, drag/drop, media, or focus logic distracts from feature rendering.

6. **Primitive composition repeated → Product UI Module**
   - Use when multiple callers compose design-system primitives with the same product rules.
