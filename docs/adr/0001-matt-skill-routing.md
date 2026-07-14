# Add issue-aware skill routing to Matt automation

Matt auto and AFK loops should route small, evidence-backed skill packs into implementation and review agents so issues get the right guidance without bloating every prompt. We decided on hybrid two-stage routing: the parent orchestrator computes baseline and issue-specific packs from labels/body/paths/skill hints, while the worker may make compact adjustments after repo exploration using only registered available skills.

## Considered Options

- Static phase skills only — predictable, but misses UI, accessibility, testing, security, and repo-domain guidance that could help the worker get it right the first time.
- Load every relevant installed skill — flexible, but too noisy and unsafe for unattended auto loops.
- Hybrid routing with a registry and repo-local config — selected because it is explainable, testable, and lets repos add domain-specific skill routes while keeping automation bounded.

## Consequences

- V1 uses extension TypeScript defaults plus optional strict JSON repo config at `.pi/matt-skill-routes.json`.
- Missing routed skills, invalid route config, and high-confidence skill overflow are hard stops for routing-aware automation.
- `/matt-tickets` writes visible and machine-readable low-authority agent skill hints, while `/matt-auto` recomputes routing before implementation.
- Skill routing is guidance uplift, not audit ceremony; closeouts and commits describe changes and verification rather than named skills.
