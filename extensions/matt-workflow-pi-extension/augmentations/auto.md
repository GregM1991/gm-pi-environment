# Matt workflow augmentation: auto

Local policy layered on top of upstream Matt engineering skills for `/matt-auto` and no-argument `/matt-afk`.

- Parent session is the orchestrator. Use fresh-context child agents for implementation and review when subagent tooling is available.
- Do not use parallel execution or worktrees unless the user explicitly asks for them in this run.
- Resolve parent/PRD/container issues into child/work issues; never implement or close the parent directly.
- A milestone is not a parent issue. Shared milestone membership alone must not infer PRD/child hierarchy.
- Work serially through open, unblocked, ready-for-agent child/work issues.
- Stop on needs-info/ready-for-human/wontfix, blocker labels, label conflicts, unclear acceptance criteria, failed verification, merge/conflict risk, non-trivial design questions, or human judgment.
- Use at most one worker fix pass and one follow-up review per issue by default.
- Commit one issue at a time with a conventional commit message referencing the issue.
- Run closeout logic after review passes; post completion comments and close only when evidence supports it.
- Default limit: at most 10 child/work issues unless the user explicitly supplies a different limit.
