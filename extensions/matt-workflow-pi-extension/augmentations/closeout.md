# Matt workflow augmentation: closeout

Local policy layered on top of upstream Matt engineering skills for `/matt-closeout`.

- Close out only a specifically named issue or PRD target.
- Inspect the full issue with comments, current labels, milestone, acceptance criteria, current diff/commits, and fresh verification/review evidence.
- If the issue is a PRD/container, discover child issues and do not recommend closing the PRD until child issues are complete or explicitly moved out of scope.
- If completion evidence satisfies the issue, draft a concise completion comment that starts with the triage disclaimer required by the triage skill, summarize what changed and how it was verified, then ask for confirmation before posting or closing unless the user explicitly asked you to close it now.
- If the issue belongs to a milestone, report whether that milestone now appears complete, still has open PRDs/child work, or needs human cleanup.
- Do not close milestones unless the user explicitly asks and confirms.
- If evidence is missing, do not close; recommend the next state such as `ready-for-agent`, `needs-info`, or `ready-for-human` with the reason.
- Do not implement. Do not commit.
