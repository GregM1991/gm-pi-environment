---
description: Draft a PR body in Greg's preferred style
argument-hint: "[PR context]"
---
Write the PR body using the following rules.

## PR context

Use this user-provided context as the source material for the PR body:

$ARGUMENTS

If the context is not enough to write a specific PR body, inspect the current branch diff, recent commits, issue links, and relevant files before drafting. Do not invent details.

## Required sections

- `## Summary`
- `## Why this matters`

## Optional sections

- `## QA`
  - Include when useful for reviewers.
  - Explain how to set up locally for testing the feature or bug fix.
  - Include any specific flows, accounts, fixtures, commands, env vars, or data needed to verify the change.
- `## Test plan`
  - Include only when I explicitly ask for it, or when the PR genuinely needs a separate test-plan section beyond QA.

## Do not include

- `## Review`
- `## Validation`
- Generated-artifact or context-file mentions unless they are part of the actual product change.

## Style rules

- Use my writing profile in this repository at `prompts/writing-style.md`.
- Casual, direct, practical, plain-English.
- No em dashes.
- Avoid colon-heavy AI-ish phrasing.
- Keep it human and specific.
- Explain why the change matters, not just what changed.
