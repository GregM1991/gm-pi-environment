# Matt workflow augmentation: slice

Local policy layered on top of upstream Matt engineering skills for `/matt-slice`.

- Before slicing, check whether top-level `MATT-GRILL-NOTES.md` exists. If it exists and refactor extraction/deletion confirmation has not happened, stop and direct the user to `/matt-refactors`.
- Break PRDs into independently grabbable vertical tracer-bullet issues. Avoid horizontal database/API/UI phases.
- If the source is a GitHub parent/PRD issue, inspect whether it has a milestone. Child slice issues should inherit that milestone unless the user says otherwise.
- Milestones are delivery grouping only, not the source of slice hierarchy.
- After creating child issues from a parent/PRD issue, update the parent issue with a predictable `## Child issues` section listing each child issue, one-line purpose, readiness label recommendation, milestone if applied, and blocker/dependency relationships.
- Replace an existing generated `## Child issues` section instead of duplicating it.
- Do not implement.
