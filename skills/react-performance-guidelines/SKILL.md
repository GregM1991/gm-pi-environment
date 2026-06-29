---
name: react-performance-guidelines
description: Review and write React code through render boundaries, state ownership, hot paths, and justified memoization. Use before implementing React features with meaningful interaction/update paths, or when reviewing React PRs for performance and architectural coupling.
disable-model-invocation: true
---

<objective>
Use React performance work to reduce actual UI work, not to decorate code with memoization hooks. This skill gives agents a shared lens for writing or reviewing React code: identify what changes, why the change reaches each component, and which parts of the tree actually deserve to update.

Use this before writing React code and during PR review when changes touch component structure, state placement, context, props, derived data, lists, forms, search/filtering, tables, dashboards, animations, polling, or any frequently-updating interaction.
</objective>

<core_principle>
React performance is mostly about **render boundaries**: the seams that determine how far an update travels through the component tree.

Do not start with “which `useMemo` is missing?” Start with:

> What changed after this interaction, and why was this component involved in that update?

Memoization is a tool for specific identity, render, or calculation costs. It is not a substitute for clear state ownership, narrow props, separated update domains, or moving expensive work off hot paths.
</core_principle>

<quick_start>
Before implementing or approving React code, answer these in order:

1. **Update source** — What event changes state: typing, click, selection, scroll, resize, polling, server response, route change?
2. **Update frequency** — Is it rare, or on a hot path that can fire many times per second?
3. **State ownership** — Does the state live at the smallest component/scope that actually owns it?
4. **Render boundary** — Which subtree rerenders when that state changes? Is that subtree the minimum useful one?
5. **Prop and context shape** — Are broad objects, arrays, callbacks, or provider values causing unrelated consumers to update?
6. **Expensive work** — Are filtering, sorting, grouping, formatting, measuring, or large list renders happening on the hot path?
7. **Optimization choice** — Can the code reduce work by moving state, splitting components, narrowing props, splitting context, virtualizing, debouncing, precomputing, moving work server-side, or only then memoizing?
</quick_start>

<writing_workflow>
When writing React code:

1. **Map interactions first**
   - Name each user-visible interaction and async update.
   - Mark whether each update is rare or hot-path.
   - Completion criterion: every new/changed state update has an owner and expected update scope.

2. **Place state close to ownership**
   - Keep state local by default.
   - Lift state only to the nearest common owner with real consumers.
   - Split state by update frequency when one parent would otherwise make static or heavy children rerender.
   - Completion criterion: no frequently-changing state is owned by a broad page/layout component unless broad updates are intentional.

3. **Create render boundaries deliberately**
   - Separate interactive controls from expensive results when their update rates differ.
   - Extract components by update responsibility, not by line count.
   - Keep static/layout-heavy shells outside hot update paths.
   - Completion criterion: a common interaction updates only components that need the new value.

4. **Keep props and context narrow**
   - Pass fields, IDs, and intent-specific callbacks instead of whole objects when children do not need the whole object.
   - Avoid creating fresh object/array/function props for memoized children unless identity is irrelevant.
   - Split context by update frequency and consumer group; memoize provider values when identity matters.
   - Completion criterion: unrelated consumers are not forced to rerender because a broad prop or provider value changed.

5. **Move expensive work off hot paths**
   - For large lists/tables, consider virtualization, pagination, server-side filtering/sorting, precomputed indexes, debouncing, or transitions.
   - Keep pure calculations as plain functions; memoize only when the calculation is expensive enough and dependencies are stable enough.
   - Completion criterion: hot interactions do not repeatedly perform avoidable heavy work.

6. **Use memoization only with a reason**
   - Use `useMemo` for expensive derived values or stable object/array identities that materially affect renders/effects.
   - Use `useCallback` for callback identity passed to memoized children, effects, subscriptions, or dependency-sensitive hooks.
   - Use `memo` when a child is expensive, receives stable props, and often gets skipped renders.
   - Prefer deleting unnecessary memoization when it adds dependency complexity without reducing meaningful work.
   - Completion criterion: every memoization hook has an identifiable calculation, identity, or child-render reason.
</writing_workflow>

<review_workflow>
When reviewing a React PR:

1. **Read for update flow, not just changed lines**
   - Identify new state, context, selectors, effects, derived values, list rendering, and prop shape changes.
   - Ask which interaction triggers each update and how far it now propagates.

2. **Flag boundary regressions**
   - State moved higher without multiple real consumers.
   - Page/layout components now own input, hover, selected-row, modal, loading, or filter state that only a small subtree needs.
   - A context provider combines hot-changing state with stable services/config.
   - A small interaction now passes through a large table, dashboard, route, or provider subtree.

3. **Flag hot-path work**
   - Filtering/sorting/grouping large arrays on every keystroke.
   - Rebuilding large objects, column definitions, chart configs, menus, schemas, or option arrays during frequent updates.
   - Rendering long unvirtualized lists/tables where data size can grow.
   - Running formatting, parsing, measuring, or validation across many rows/items per interaction.

4. **Judge memoization honestly**
   - Do not request `useMemo`/`useCallback` as a ritual.
   - Do request memoization when the PR introduces expensive calculations or unstable identities that cross memoized/effect/context boundaries.
   - Do request architectural fixes when memoization only hides state placed too high or props that are too broad.

5. **Make review comments actionable**
   - Name the update source and affected subtree.
   - Explain whether the problem is ownership, boundary width, prop identity, context fanout, or hot-path work.
   - Suggest the smallest fix: colocate state, split component, split context, pass narrower props, virtualize, debounce, precompute, move server-side, or memoize.
</review_workflow>

<comment_templates>
Use these shapes for PR comments:

```md
This state looks lifted higher than its ownership. `search` changes on every keystroke, but it lives in `DashboardPage`, so the whole page participates in the update. Could `SearchBox` own the input state and only publish debounced/query-submitted changes to the table?
```

```md
This memoization treats the symptom, not the render boundary. `useMemo` may reduce the filter cost, but every keystroke still updates the parent that owns the table, modal, and summary panels. Consider splitting the interactive search state from the static/heavy page shell first.
```

```md
This provider mixes hot-changing UI state with stable dependencies. Any `selectedRow` change will invalidate all consumers of the context, including ones that only need the API client/config. Could this be split into separate providers or narrower props?
```

```md
This is a good use of `useMemo`: the derived list is potentially large, the inputs are explicit, and the value crosses into an expensive child. Please add/keep a short comment or test data size expectation if this cost is not obvious locally.
```
</comment_templates>

<decision_rules>
<rule name="state_placement">
- Local state until proven shared.
- Lift only to the nearest common owner.
- Split state by update frequency: hot UI state should not invalidate cold layout/data state.
</rule>

<rule name="context">
- Context is a broadcast mechanism. Treat every provider value change as potentially reaching every consumer.
- Split stable services/config from hot UI state.
- Memoize provider values when consumers depend on stable identity, but do not use `useMemo` to excuse an over-broad provider.
</rule>

<rule name="props">
- Prefer narrow props that match what the child renders or does.
- Passing a whole object is fine when the child genuinely owns/display the object; avoid it when the child needs one field and identity churn matters.
- Stable keys must survive reorder, insert, and delete; index keys are a performance and correctness smell for dynamic lists.
</rule>

<rule name="expensive_lists">
- If list size can grow beyond trivial amounts, review filtering, sorting, row rendering, key stability, virtualization, pagination, and server-side options.
- Tables, charts, timelines, rich cards, editors, and dashboards deserve extra scrutiny because each item render can be expensive.
</rule>

<rule name="memoization">
- `useMemo`: expensive derived value or stable identity needed downstream.
- `useCallback`: callback identity matters to a memoized child, effect, subscription, or dependency-sensitive hook.
- `memo`: child is expensive, props are stable, and skipped renders are plausible.
- Delete memoization that protects cheap work, hides unclear dataflow, or creates brittle dependency arrays.
</rule>
</decision_rules>

<anti_patterns>
- Optimizing first by wrapping everything in `useMemo`, `useCallback`, or `memo`.
- Broad page components owning search text, hover state, selected IDs, modal state, and loading flags for unrelated regions.
- One context object containing both stable services and hot-changing UI state.
- Passing API response blobs or large row objects through many layers when children need a few fields.
- Recomputing column definitions, schemas, menus, filters, or large derived arrays on every render without checking whether the render is hot.
- Treating “component rerendered” as a bug without asking whether the rerender was cheap, expected, and correctly bounded.
- Adding custom comparison functions to `memo` before fixing prop shape or state placement.
</anti_patterns>

<verification_checklist>
Before finishing implementation or review, confirm:

- [ ] Every hot-path interaction has a named update source and expected update scope.
- [ ] Frequently-changing state is colocated with its real owner or nearest common owner.
- [ ] Static/heavy UI is separated from hot interactive state where practical.
- [ ] Props and context values are no broader than their consumers need.
- [ ] Large lists/tables/charts are not doing avoidable work per keystroke/selection/scroll.
- [ ] Memoization is present only where it has a clear calculation, identity, or child-render purpose.
- [ ] Review comments distinguish architectural boundary issues from legitimate memoization opportunities.
</verification_checklist>
