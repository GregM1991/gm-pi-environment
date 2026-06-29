---
name: build-react-codebase-guidelines
description: Guides agents proactively while building and iterating on React and TypeScript codebases. Use when implementing React features, shaping components, adding hooks, introducing state, choosing dependencies, organizing frontend files, or preparing React code for review.
disable-model-invocation: true
---

<objective>
Build React code that stays easy to change as it grows. This skill gives proactive engineering guardrails for agents implementing or iterating on React and TypeScript codebases, so maintainability problems are prevented rather than found later in review.

Use it before and during implementation: when planning component seams, adding state, choosing libraries, organizing files, modeling loading/error states, or deciding whether a hook, context, global store, adapter, or plain function is the right tool.
</objective>

<quick_start>
Before writing React code, choose the smallest durable shape:

1. **Name the user behavior** the code is responsible for.
2. **Keep state local by default**; lift it only when two real consumers need it.
3. **Prefer plain functions** for pure transformations; use hooks only when React lifecycle, state, context, or effects are required.
4. **Colocate feature files** around the behavior they serve.
5. **Model async UI explicitly**: loading, error, empty, success, and pending states.
6. **Create seams at unstable edges**: third-party libraries, browser APIs, server APIs, auth, flags, analytics, dates, and money.
7. **Verify through behavior**: tests should exercise what users see and what callers depend on, not implementation trivia.
</quick_start>

<principles>
<principle name="boring_by_default">
Reach for boring React first: components, props, local state, derived values, plain functions, and clear composition. Add abstractions only when they reduce what callers must know.
</principle>

<principle name="locality_over_cleverness">
A future maintainer should know where to change behavior. Keep rendering, state transitions, validation display, accessibility wiring, and tests near the feature unless there is a real shared concept.
</principle>

<principle name="explicit_ui_states">
Every user-facing async or conditional surface needs explicit loading, error, empty, disabled, pending, and success behavior as applicable. Do not rely on impossible states being impossible unless the type system enforces it.
</principle>

<principle name="interfaces_are_promises">
Props, hook returns, context values, route loaders, adapters, and exported helpers are promises to callers. Keep them narrow, named in domain language, and stable.
</principle>

<principle name="dependencies_have_carrying_cost">
Every dependency affects bundle size, upgrades, security, types, and future React compatibility. Prefer built-ins for simple work; use trusted libraries for hard domains such as dates, i18n, accessibility, forms, querying, and security-sensitive behavior.
</principle>
</principles>

<workflow>
1. **Read local conventions first**
   - Inspect package scripts, lint/format config, TypeScript config, framework conventions, routing conventions, existing component patterns, and architecture docs.
   - Match the project unless the existing pattern creates clear harm.

2. **Plan the feature shape**
   - Identify the user-visible behavior, data sources, mutations, permissions, loading/error/empty states, and accessibility obligations.
   - Decide which module owns each responsibility: route, server/query adapter, UI component, hook, form, state module, or plain function.
   - Avoid designing around hypothetical reuse. One caller usually needs direct code; two callers may justify a named seam.

3. **Choose the right React tool**
   - Use a **component** for reusable UI behavior and markup.
   - Use a **plain function** for pure calculation, formatting, filtering, sorting, mapping, and predicates.
   - Use a **hook** when logic needs React state, lifecycle, effects, refs, context, or subscriptions.
   - Use **local state** for UI state owned by one feature surface.
   - Use **refs** for mutable values that should not trigger renders.
   - Use **context** for values many descendants read, especially stable services or scoped feature state.
   - Use a **global store** only for cross-route or cross-feature state with multiple real writers/readers.

4. **Design state deliberately**
   - Do not store values that can be derived from props, query data, or existing state during render.
   - Represent async state as explicit states rather than scattered booleans when combinations matter.
   - Keep server cache state in the data-fetching layer; do not duplicate it into local state without a reason.
   - Split state by update frequency when broad renders would become costly.

5. **Design components deliberately**
   - Pass the smallest useful props; avoid passing whole objects for one field.
   - Keep conditionals readable with early returns, named predicates, or small presenter components.
   - Extract components by responsibility and vocabulary, not line count.
   - Keep accessibility part of the component contract: labels, roles, focus, keyboard behavior, error association, and announcements.

6. **Design effects deliberately**
   - Treat effects as synchronization with the outside world, not a default place for business logic.
   - Do not disable `react-hooks/exhaustive-deps` to make warnings disappear. Reshape the effect, stabilize inputs, or move pure logic out.
   - Clean up subscriptions, timers, observers, and async races.
   - Prefer framework/data-library mechanisms for fetching where available.

7. **Create adapter seams for unstable dependencies**
   - Wrap third-party SDKs, analytics, browser storage, feature flags, date/time providers, API clients, and payment/auth services behind local modules.
   - Keep third-party types from leaking throughout feature code when they would lock callers to vendor details.
   - Mock or fake the local adapter in tests, not the vendor API everywhere.

8. **Keep TypeScript honest**
   - Model domain concepts with named types.
   - Narrow nullable and unknown data at boundaries.
   - Avoid `any`, broad casts, non-null assertions, and ignored compiler errors unless the local boundary documents why.
   - Prefer discriminated unions for state machines and async UI states.

9. **Verify before finishing**
   - Run the project's formatter, linter, typecheck, and relevant tests.
   - Add or update behavior-focused tests for new user-visible states and caller contracts.
   - Manually inspect critical flows when visual, accessibility, or interaction details changed.
</workflow>

<decision_rules>
<rule name="component_or_hook_or_function">
- If it can run outside React, make it a plain function.
- If it renders UI, make it a component.
- If it coordinates React state/effects/context for a component, make it a hook.
- If a hook only calls a pure helper and returns the result, delete the hook and export the helper.
</rule>

<rule name="local_or_global_state">
- Start local.
- Lift to nearest common owner when sibling components need it.
- Use context for scoped shared reads.
- Use a global store for state that is truly app-level, cross-route, or independently updated by distant features.
</rule>

<rule name="memoization">
- Do not memoize by default.
- Memoize context provider values, expensive derived calculations, stable callbacks passed to memoized children, and objects/arrays whose identity affects effects or renders.
- Avoid default object, array, or function literals in parameters/props when they break stable identity.
</rule>

<rule name="file_organization">
- Colocate files that change together: component, hook, presenter, tests, styles, and feature helpers.
- Promote shared modules only after a repeated concept appears.
- Avoid broad barrel files. Prefer explicit imports or narrow public indexes that preserve dependency direction.
</rule>

<rule name="dependencies">
- Use built-ins for simple array/object/string/date-display operations when readable.
- Check existing project dependencies before adding new ones.
- Add a dependency only when it removes real complexity and has acceptable bundle, maintenance, type, and security cost.
</rule>
</decision_rules>

<implementation_checklist>
Before handing off React code, confirm:

- The feature has explicit loading, error, empty, success, disabled, and pending behavior where applicable.
- Derived values are not duplicated into state.
- Effects synchronize with external systems and have correct dependencies and cleanup.
- Props are narrow and named in project/domain language.
- Lists use stable keys that survive reorder, insert, and delete.
- Context values are split and memoized when identity or update frequency matters.
- Third-party services sit behind local adapters when their API is unstable or widely used.
- TypeScript boundaries narrow unknown/nullish data before it reaches UI code.
- Accessibility obligations are implemented, not left to callers.
- Formatter, linter, typecheck, and relevant tests have run.
</implementation_checklist>

<anti_patterns>
- Do not introduce global state because prop drilling feels mildly inconvenient.
- Do not create generic components before the second real use case proves the shared shape.
- Do not hide unclear logic inside a hook and call that architecture.
- Do not use `useEffect` to derive state that can be computed during render.
- Do not silence hook dependency warnings without a written reason and safer alternative considered.
- Do not pass vendor SDK objects or API response blobs deep into UI components.
- Do not split components into folders that make one behavior harder to understand.
- Do not add memoization as a ritual; add it to solve identity, render, or calculation problems.
</anti_patterns>

<success_criteria>
React code built with this skill:
- Has clear ownership for UI, state, effects, data access, and third-party boundaries.
- Keeps interfaces narrow and domain-named.
- Makes user-visible states explicit and testable.
- Avoids preventable dependency, state, context, hook, and memoization traps.
- Follows project conventions while improving locality, accessibility, performance, and change safety.
</success_criteria>
