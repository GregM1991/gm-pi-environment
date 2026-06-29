# Interface Design

When the user wants to explore alternative Interfaces for a chosen frontend deepening candidate, use this parallel sub-agent pattern. Based on "Design It Twice" (Ousterhout) — your first idea is unlikely to be the best.

Uses the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **Module**, **Interface**, **Seam**, **Adapter**, **Leverage**, **Locality**.

## Process

### 1. Frame the problem space

Before spawning sub-agents, write a user-facing explanation of the frontend problem space for the chosen candidate:

- The user-facing behaviour that must be preserved
- The developer callers that will cross the new Seam
- The current caller obligations that make the Module shallow
- The loading, error, empty, pending, and accessibility states the Interface must account for
- The data/query/form Adapters involved, and which category they fall into (see [DEEPENING.md](DEEPENING.md))
- A rough illustrative JSX/TypeScript sketch to ground the constraints — not a proposal, just a way to make the constraints concrete

Show this to the user, then immediately proceed to Step 2. The user reads and thinks while the sub-agents work in parallel.

### 2. Spawn sub-agents

Spawn 3+ sub-agents in parallel using the Agent tool. Each must produce a **radically different** Interface for the deepened frontend Module.

Prompt each sub-agent with a separate technical brief: file paths, current caller obligations, data sources, dependency category from [DEEPENING.md](DEEPENING.md), form/query/fetcher behaviour, accessibility constraints, tests that should survive, and what sits behind the Seam. Give each agent a different design constraint:

- Agent 1: "Minimize the Interface — aim for 1–3 props or entry points max. Maximise Leverage per prop."
- Agent 2: "Maximise flexibility — support extension points, custom rendering, and future variants without leaking the Implementation."
- Agent 3: "Optimise for the most common caller — make the route/page usage trivial, even if the Implementation grows."
- Agent 4 (if applicable): "Separate Hook Module from UI Module — design a behaviour Interface and a rendering Interface."

Include both [LANGUAGE.md](LANGUAGE.md) vocabulary and project/domain vocabulary in the brief so each sub-agent names things consistently.

Each sub-agent outputs:

1. Interface: props, hook params/returns, invariants, ordering, loading/error/empty states, accessibility obligations, and error modes
2. Usage example showing how callers use it
3. What the Implementation hides behind the Seam
4. Dependency strategy and Adapters for data, form submission, browser APIs, design-system primitives, or test fakes (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs — where Leverage is high, where the Module remains thin

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **Depth** at the Interface, **Locality** of changes, **Seam** placement, test surface, accessibility ownership, and route simplicity.

After comparing, give your recommendation: which design is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not a menu.
