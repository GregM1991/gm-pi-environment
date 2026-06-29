# Matt workflow augmentation: review

Local policy layered on top of upstream Matt engineering skills for `/matt-review`.

- Review from a fresh context using the issue/PRD, current diff, `AGENTS.md`, `CONTEXT.md`, and relevant ADRs as the standard.
- Produce file:line findings with severity and concrete fixes.
- Do not silently fix unless asked.
- Treat architecture findings as blockers only when they affect the issue's correctness, maintainability, or future workflow safety; otherwise recommend follow-up issues.
