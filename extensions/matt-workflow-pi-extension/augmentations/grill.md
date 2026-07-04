# Matt workflow augmentation: grill

Templates for the `MATT-GRILL-NOTES.md` scratch document, layered on top of upstream Matt engineering skills for `/matt-grill`. Lifecycle rules (lazy creation, append-only Q&A, refactor extraction, deletion confirmation) live in the phase prompts; this file owns the document formats.

## Append-only Q&A record

Record each answered grill question in an append-only Q&A section. Never rewrite or reorder prior entries. Use numbered entries:

```md
## Q&A

### Q1. <question>

- Recommended answer: <your recommendation>
- User answer: <what the user decided>
- Decision: <canonical resolved direction>
- Rationale: <short reason>
```

If a later answer changes direction, append a new entry that supersedes the earlier entry; do not edit the earlier one.

## Potential refactors discovered during grilling

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
