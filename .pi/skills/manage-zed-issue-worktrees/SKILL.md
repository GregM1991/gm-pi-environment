---
name: manage-zed-issue-worktrees
description: Create and retire issue-specific Zed-style worktrees for parallel work in pi-environment.
---

## When to Use

Use when creating, assigning, inspecting, or removing a linked worktree for an issue in this repository, especially for parallel Matt workstreams.

## Procedure

1. Re-read the target issue and its native blockers. Start only when every blocker is merged to the remote default branch.
2. Fetch `origin/main`. Name the disposable worktree `issue-<number>-<short-slug>` under Zed's `../worktrees` directory; use issue-specific names rather than reusable lane names.
3. Create it the Zed way: detached from the latest remote default branch (`git worktree add --detach ../worktrees/<name> origin/main`).
4. Open or switch to the worktree in Zed, then create the issue branch from inside that detached worktree using Zed's branch picker. For agent-only operation, the equivalent is `git switch -c matt/issue-<number>-<3-to-5-word-descriptor>`.
5. Assign exactly one writer to the worktree. Integrate parallel branches serially; after each sibling merge, update remaining dependent work from the new remote default branch and rerun its complete checks.
6. After the issue is merged, close the worktree in Zed, remove the linked worktree, prune stale registrations, and delete its branch only after confirming the merge.

## Pitfalls

- Do not use generic names such as `lane-a`; disposable issue names prevent stale-state and wrong-ticket mistakes.
- Do not create a dependent ticket's worktree from an unmerged blocker branch or merely review-ready PR.
- Do not check out the same branch in multiple worktrees or let multiple agents write in one worktree.
- Create and edit only from this canonical checkout and its linked worktrees, never the installed Pi package cache.
- Do not run `bin/bootstrap.sh` as worktree setup; it mutates live Pi configuration and requires explicit user authorization.

## Verification

1. `git worktree list --porcelain` shows the expected issue-specific path exactly once.
2. Before branch creation, the worktree is detached and `HEAD` equals `origin/main`; afterward, `git status --short --branch` shows the intended issue branch and a clean tree.
3. Immediately before dispatch, GitHub shows every native blocker complete and the issue remains open and ready for agent work.
4. After retirement, the worktree path and registration are absent, and the main checkout remains unchanged.
