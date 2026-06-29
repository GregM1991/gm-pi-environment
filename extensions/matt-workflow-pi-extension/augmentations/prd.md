# Matt workflow augmentation: PRD

Local policy layered on top of upstream Matt engineering skills for `/matt-prd`.

- Treat milestones as optional human-facing delivery arcs above PRDs; they do not replace the PRD -> child issue hierarchy.
- If the user mentions a release, delivery arc, feature direction, or milestone, ask whether the PRD should be associated with an existing GitHub milestone or a newly confirmed milestone.
- Do not create a milestone unless the user explicitly asks or confirms the exact title and optional due date.
- If publishing or updating a PRD issue and the milestone is confirmed, apply it to the PRD issue and note the association in the PRD body.
- Use `MATT-GRILL-NOTES.md` if present for durable Q&A decisions, but do not include out-of-scope refactor candidates in the PRD.
- After PRD completion, recommend the formal refactor-review phase before slicing.
