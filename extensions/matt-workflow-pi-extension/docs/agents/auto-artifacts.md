# Auto Loop artifact lifecycle

Read this reference when an Auto Loop selects an issue, before creating or updating its review packet or verification evidence. The Parent Orchestrator owns these artifacts and completes every permission, handoff, invalidation, and cleanup rule below.

## Per-issue review packet

Before launching an implementation, fix, or review child, write the issue packet outside the worktree at `${TMPDIR:-/tmp}/matt-auto-review-packets/<repo-id>/<issue>.md`.

Derive `<repo-id>` from the repository root identity: use the canonical `owner/name` from the normalized `origin` URL when available, otherwise the real absolute worktree path. UTF-8 encode that identity, base64url encode it without padding, and prefix it with `gh-` or `path-` respectively. The result must contain only `[A-Za-z0-9_-]`.

Create the packet root and repository directory with mode `0700` and each packet with mode `0600`, correcting existing modes before use. The packet is temporary orchestration state outside the worktree: never stage or commit it, and exclude it from dirty-worktree handling.

Include:

- the fetched issue body and acceptance criteria;
- the parent/spec reference, or `none`;
- the routing contract and selected skill pack;
- relevant `AGENTS.md`, `CONTEXT.md`, ADR, and durable-document references, or `none found`;
- commands and paths for the current diff; and
- the current compact verification summary, failing cases, and verification log path.

Update the same packet when diff or verification evidence changes. Every child contract supplies its absolute path, treats it as provided context, and still requires independent inspection of the actual code and diff.

## Verification evidence

Keep complete verification output in `.pi/matt-verification/<issue>-<stage>.log`. Valid stage names are `<issue>-initial.log`, `<issue>-fix-<n>.log`, and `<issue>-pre-commit.log`, where `<n>` is the fix-cycle number.

Before writing logs, ensure `.pi/matt-verification/` is ignored by Git; use the repo-local `.git/info/exclude` when the target repo does not already ignore it. Create the directory with mode `0700` and each log with mode `0600`, correcting existing modes before use.

Child handoffs contain only the pass/fail summary, failing cases, and log path. A review child receives this compact evidence and may read the log on demand.

### Verification invalidation

Use focused tests during intermediate edits. Run the complete repo check once when an implementation pass or fix cycle is complete. That check remains valid for pre-commit while code and verification-relevant inputs are unchanged. Review results, ledger appends, compact summaries, packet updates, and log bookkeeping do not invalidate it.

After remediation, code changes, or another verification-relevant input change, rerun the complete check immediately before commit and write its output to the pre-commit log. Never require two identical consecutive complete checks.

## Cleanup

After successful issue closeout, delete that issue's packet and logs. On every loop termination path, delete every packet and verification log created by the run, remove the repository packet directory when empty, remove the packet root when empty, and remove `.pi/matt-verification/` when empty. Report a cleanup failure as part of the stop reason.

Completion criterion: no artifact created by the run remains after closeout or termination, and every surviving evidence handoff contains only compact output plus its private log path.
