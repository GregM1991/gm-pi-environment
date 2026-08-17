---
name: improve-frontend-architecture
description: Find deepening opportunities in frontend code, especially React routes, UI modules, hooks, forms, state modules, and presenter modules. Use when the user wants to improve frontend architecture, find shallow UI modules, simplify routes, consolidate interaction rules, improve testability, or make frontend code more AI-navigable.
---

# Improve Frontend Architecture

Surface frontend architectural friction and propose **deepening opportunities** — refactors that turn shallow frontend modules into deep ones. The aim is testability, accessibility, consistency, route simplicity, and AI-navigability.

## Glossary

Use these terms exactly in every suggestion. Consistent language is the point — don't drift into vague words like "piece," "thing," or "boundary." Full definitions in [LANGUAGE.md](LANGUAGE.md).

- **Module** — anything with an interface and an implementation. In frontend code this includes routes, UI modules, hooks, forms, state modules, presenter modules, and feature slices.
- **Interface** — everything a caller must know to use the module: props, hook returns, callback ordering, loading/error/empty states, accessibility obligations, data shape, config, and styling/layout assumptions. Not just TypeScript props.
- **Implementation** — the code inside: rendering branches, hooks, state transitions, effect timing, formatting, validation display, query/fetcher behaviour, accessibility wiring, layout classes, and helpers.
- **Depth** — leverage at the interface: a lot of useful UI behaviour behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without editing the caller. (Use this, not "boundary," unless quoting project docs.)
- **Adapter** — a concrete thing satisfying an interface at a seam: route loader adapter, query adapter, browser API adapter, design-system primitive adapter, or test fake.
- **Leverage** — what callers get from depth: UI behaviour, consistency, accessibility, and state handling per prop/callback/config fact they must learn.
- **Locality** — what maintainers get from depth: change, bugs, interaction rules, visual policy, accessibility behaviour, and tests concentrated in one place.

Key principles (see [LANGUAGE.md](LANGUAGE.md) for the full list):

- **Deletion test**: imagine deleting the module or inline block. If complexity vanishes, it was pass-through clutter. If complexity reappears across callers, it was earning its keep or revealing a missing module.
- **The interface is the test surface.** Frontend tests should verify what end users see/do and what developer callers receive across the same seam callers use.
- **One adapter = hypothetical seam. Two adapters = real seam.** Do not create elaborate adapter seams for variation that does not exist.
- **Routes compose; modules own behaviour.** Route modules should not casually own feature UI behaviour, interaction policy, or repeated state mapping inline.
- **Accessibility is part of the interface.** If callers must remember aria labels, focus rules, keyboard behaviour, or error announcements, the module is probably too shallow.

This skill is _informed_ by the project's domain model and frontend architecture rules. The domain language gives names to good seams; route/component guidance and ADRs record decisions the skill should not re-litigate.

## Process

### 1. Explore

Read the project's domain glossary, frontend architecture guidance, and any ADRs in the area you're touching first. In many projects this means files such as `CONTEXT.md`, `docs/adr/`, route guidance, component guidance, form architecture docs, design-system docs, and testing docs.

Then use the Agent tool with `subagent_type=Explore` to walk the frontend codebase. Don't follow rigid heuristics — explore organically and note where you experience friction:

- Where does understanding one user interaction require bouncing between many routes, UI modules, hooks, forms, and helpers?
- Where are modules **shallow** — callers must know nearly as much as the implementation?
- Where is a route module implementing feature behaviour inline instead of composing a deeper UI, hook, form, state, or presenter module?
- Where are loading, error, empty, pending, disabled, stale, or status states repeated across call sites?
- Where do callers provide props that mirror internal state transitions or callback ordering?
- Where do accessibility rules leak to callers: aria labels, focus management, keyboard behaviour, announcements, or error associations?
- Where have pure functions or hooks been extracted just for testability, but the real bugs hide in how they're wired together (no **locality**)?
- Which frontend behaviours are untested, over-mocked, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow. If no abstraction exists yet, apply the test to the inline block: would deleting it remove the complexity, or would the same interaction/rendering rules need to reappear elsewhere? A "yes, it would reappear" is the signal you want.

### 2. Present candidates

Present a numbered list of frontend deepening opportunities. For each candidate:

- **Files** — which files/modules are involved
- **Problem** — why the current frontend architecture is causing friction
- **Solution** — plain English description of what would change
- **Benefits** — explained in terms of locality and leverage, and also in how tests, accessibility, route simplicity, and user consistency would improve

Use project vocabulary for the domain, and [LANGUAGE.md](LANGUAGE.md) vocabulary for the architecture. If `CONTEXT.md` defines "Session," talk about "the Session artifacts module" — not "the route thing." If project docs distinguish route modules from UI modules, preserve that language while still using **Module**, **Interface**, **Implementation**, **Seam**, **Adapter**, **Leverage**, and **Locality**.

**ADR or guidance conflicts**: if a candidate contradicts existing route/component/form guidance or an ADR, only surface it when the friction is real enough to warrant revisiting that decision. Mark it clearly (for example, _"contradicts route guidance — but worth reopening because…"_). Don't list every theoretical refactor a project convention forbids.

Do NOT propose interfaces yet. Ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree with them — constraints, callers, data sources, interaction states, accessibility obligations, the shape of the deepened module, what sits behind the seam, and what tests survive.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md`. Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy frontend term during the conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future frontend architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing — skip ephemeral reasons ("not worth it right now") and self-evident ones.
- **Need to classify dependencies before shaping the seam?** See [DEEPENING.md](DEEPENING.md).
- **Want to explore alternative interfaces for the deepened module?** See [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md).
