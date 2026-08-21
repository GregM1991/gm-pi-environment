---
name: write-pr
description: Draft a pull request body in Greg's preferred style. Use when the user asks to write, draft, or rewrite a PR body or PR description.
---

# Write PR

Write the PR body using the following rules.

## PR context

Use the user-provided context as the source material for the PR body.

If the context is not enough to write a specific PR body, inspect the current branch diff, recent commits, issue links, and relevant files before drafting. Do not invent details.

## Required sections

- `## Summary`
- `## Why this matters`

## Optional sections

- `## QA`
  - Include when useful for reviewers.
  - A concise step-by-step guide to get a reviewer to a place where they can test the actual functionality (e.g. navigate here, do this action, use this account/fixture/flag, look for this result), including specific flows, accounts, fixtures, env vars, or data needed to get into the right state to verify the change.
  - Do not include repo/build/verification commands like `npm run ...`, `npx ...`, `yarn ...`, test runners, linters, or type-checkers. Focus purely on manual functional verification steps.
- `## Test plan`
  - Include only when the user explicitly asks for it, or when the PR genuinely needs a separate test-plan section beyond QA.

## Do not include

- `## Review`
- `## Validation`
- Generated-artifact or context-file mentions unless they are part of the actual product change.

## Style rules

- Load and follow the available skills before drafting:
  - `writing-style`
  - `unslop`
- If any of the skills are not available stop and say so.
