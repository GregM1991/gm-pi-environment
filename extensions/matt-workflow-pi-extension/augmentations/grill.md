# Matt workflow augmentation: grill

Local policy layered on top of upstream Matt engineering skills for `/matt-grill`.

## Grill session scratch document

For codebase work, maintain a repo-local, top-level scratch document named `MATT-GRILL-NOTES.md`. Create it lazily after the first answered grill question or the first out-of-scope refactor finding. Do not create it just because the phase started.

The scratch document is temporary workflow state. It should be deleted, after explicit user confirmation, before the workflow moves from post-PRD refactor review into PRD slicing.

### Append-only Q&A record

Record each answered grill question in an append-only Q&A section. Never rewrite or reorder prior Q&A entries. Use numbered entries:

```md
## Q&A

### Q1. <question>

- Recommended answer: <your recommendation>
- User answer: <what the user decided>
- Decision: <canonical resolved direction>
- Rationale: <short reason>
```

If a later answer changes direction, append a new entry that supersedes the earlier entry; do not edit the earlier one.

### Potential refactors discovered during grilling

Track only refactor candidates that are outside the PRD scope being grilled. If a discovery belongs in the PRD target, capture it in the grill Q&A/PRD context instead and leave it out of the refactor candidates section.

The potential refactors section is not append-only. Update and group it as understanding improves. Prefer groups such as:

- `Follow-up refactor candidates`
- `Possibly unrelated findings`
- `Needs triage before issue creation`

Each candidate should include enough context to make a quick later decision:

```md
## Potential out-of-scope refactors

### <short candidate title>

- Why it surfaced: <grill context>
- Why it is outside this PRD: <scope boundary>
- Possible GitHub issue: <one-sentence issue shape>
```

## Provenance

This augmentation was extracted by directly comparing the vendored `grill-with-docs/SKILL.md` against the previously local `grill-with-docs` skill. The scratch-document section existed only in the vendored copy, so it lives here instead of inside `vendor/`.
