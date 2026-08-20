---
name: matt-workflow
description: Always-discovered router for the Matt Pocock AI feature workflow extension. Use to enter and follow the current generated Phase; branch-specific behavior comes from that Phase message and its precise skill, Augmentation, and Agent Reference pointers.
---

# Matt workflow router

This router is the small, always-loaded Interface to the workflow. The extension owns command-to-Phase routing and phase-to-skill mapping; this file does not recreate Phase policy.

## Universal invariants

- The generated Phase message is the active workflow Interface. Complete only that Phase and do not perform actions reserved for a later Phase.
- Tracker mutations are Phase actions. Perform them only when the active Phase message or an explicit user request authorizes them.
- Use durable repo context named by the Phase: root and relevant directory `AGENTS.md`, `CONTEXT.md`, ADRs, workflow docs, and tracker issues.
- Treat Vendored Matt Skills as read-only upstream guidance. Local Augmentations override conflicting upstream skill guidance.
- Use only skills listed by the current Phase or assigned through its routed skill pack. Read applicable selected files at their supplied paths before acting; skip a listed skill that does not fit and briefly state why.
- Keep completion evidence durable and satisfy every active Done condition before leaving the Phase.

## Follow the active Phase

1. Read the generated Phase message fully: objective, hard constraints, ordered contract when present, and Done conditions.
2. At the step or condition named by the message, follow each branch-triggered Augmentation and Agent Reference pointer before acting on that branch.
3. Apply applicable vendored and routed skill guidance inside the Phase contract. The Phase message and its local references determine role, scope, authority, and stop behavior.
4. When a required pointer is missing or unreadable, stop at that branch and report the missing authoritative guidance instead of reconstructing policy from this router.

## Phase boundaries

One extension command selects one active Phase. A Phase may recommend its successor, but it does not execute the successor unless its generated message contains an explicit ordered loop contract. The generated Phase message is the source of truth for allowed artifacts, human-presence requirements, orchestration, tracker mutations, and completion evidence.
