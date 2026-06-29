# Language

Shared vocabulary for every frontend architecture suggestion this skill makes. Use these terms exactly — don't substitute vague words like "piece," "thing," or "boundary." Consistent language is the whole point.

## Core terms

**Module**
Anything with an interface and an implementation. In frontend code this includes routes, UI modules, hooks, form modules, state modules, presenter/formatter functions, compound UI modules, and feature slices.
_Avoid_: component when you mean Module. Use "UI Module" when the React component nature matters.

**Interface**
Everything a caller must know to use the Module correctly. In frontend code this includes props, hook return values, callback ordering, loading/error/empty states, accessibility obligations, form constraints, pending-state rules, data shape, and styling/layout assumptions. Not just TypeScript props.
_Avoid_: props when you mean the full Interface.

**Implementation**
What sits inside a Module: rendering branches, hooks, state transitions, effect timing, formatting, validation display, query/fetcher behaviour, accessibility wiring, layout classes, and internal helper functions.

**Depth**
Leverage at the Interface — the amount of useful UI behaviour a caller gets per fact it must learn. A Module is **deep** when a lot of interaction, rendering, accessibility, and state behaviour sits behind a small Interface. A Module is **shallow** when callers must know nearly as much as the Implementation.

**Seam**
Where a Module's Interface lives; a place behaviour can be altered without editing the caller. In frontend code, common seams are route-to-feature, page-to-panel, panel-to-card, hook-to-renderer, form-to-field, and UI-to-data Adapter.
_Avoid_: boundary unless quoting project docs.

**Adapter**
A concrete thing satisfying an Interface at a Seam. In frontend code, examples include a route loader Adapter, a tRPC/query Adapter, a browser API Adapter, a design-system primitive Adapter, or a fake data Adapter in tests.

**Leverage**
What callers get from Depth. More UI capability, consistency, accessibility, and state handling per prop/callback/config fact they must learn.

**Locality**
What maintainers get from Depth. Change, bugs, interaction rules, styling policy, accessibility behaviour, and verification concentrate in one place rather than spreading across routes and call sites.

## Frontend-specific terms

**Route Module**
A Module whose main job is routing: read params/context, call route loaders/actions or client query Adapters, and compose feature/UI Modules. It should not casually implement feature UI behaviour inline.

**UI Module**
A React Module that owns visual and interaction behaviour. Its Interface is props plus caller obligations; its Implementation includes markup, accessibility, styling, and internal state.

**Hook Module**
A Module that owns reusable behaviour without committing to markup. Its Interface is parameters and returned state/actions; its Implementation includes effects, local state, derivations, and external Adapter calls.

**Form Module**
A Module that owns a form's user-facing lifecycle: default values, validation display, submission state, expected failure rendering, field composition, and action/fetcher semantics.

**Presenter Module**
A Module that translates domain state into labels, icons, colors, actions, disabled states, summaries, or view models.

## Principles

- **Depth is a property of the Interface, not file size.** A large UI Module can be deep if callers get rich behaviour from a small Interface. A tiny wrapper can be shallow if it only renames props.
- **The deletion test.** If deleting a Module or inline block makes complexity vanish, it was probably pass-through clutter. If the complexity must reappear across callers, it is a real concept that may deserve a deeper Module. When no abstraction exists yet, apply the test to the inline block: would removing it expose a missing concept?
- **The Interface is the test surface.** Tests should verify what end users see/do and what developer callers receive across the same Seam callers use. Avoid tests that require reaching into the Implementation.
- **One Adapter = hypothetical Seam. Two Adapters = real Seam.** Do not create elaborate Adapter seams for variation that does not exist. Internal helpers are fine; not every helper is an architectural Seam.
- **Routes compose; Modules own behaviour.** A Route Module may be route-specific, but when it accumulates interaction rules, status mapping, download logic, or form lifecycle details, look for a deeper feature/UI Module.
- **Accessibility is part of the Interface.** If callers must remember aria labels, focus behaviour, keyboard handling, or error announcement rules, the Module is likely too shallow.
- **Visual consistency is leverage.** Repeated status badges, empty states, pending buttons, card layouts, and action affordances are candidates for Presenter or UI Modules when they encode product rules.

## Relationships

- A **Module** has one external **Interface** for callers and may have internal Seams used by its Implementation.
- **Depth** is measured by how much frontend behaviour sits behind the Interface.
- A **Seam** is where the Interface is crossed.
- An **Adapter** sits at a Seam and satisfies the Interface.
- **Depth** produces **Leverage** for callers and **Locality** for maintainers.

## Rejected framings

- **"Component extraction" as the goal.** Extraction alone can create shallow Modules. The goal is Depth, Locality, and Leverage.
- **"Props" as the whole Interface.** Props are only the type-level part. The Interface also includes behaviour, accessibility, visual states, and caller obligations.
- **"DRY" as the primary reason.** Duplication matters most when it duplicates product rules, interaction rules, accessibility rules, or state transitions. Identical markup alone is not enough.
- **"Make everything reusable."** A route-local deep Module is valuable even if it has one caller, when it gives the route Locality and makes the feature testable through a clear Interface.
