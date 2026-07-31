# Investigation: How Pi consumes GitHub CI and PR feedback

## Executive recommendation

Use `gh` as a thin wrapper over GitHub’s documented APIs, not as the source of truth. For CI, poll the PR head SHA’s check runs and combined commit status with `gh api`, then separately read the branch’s required-check config; for review feedback, use `gh pr view --json ...` for quick summaries but use GraphQL `reviewThreads` plus REST review comments/check annotations for machine-readable blocking evidence. GitHub recommends webhooks over polling, so the long-term bridge should be webhook-first via the planned gateway MCP; until then, a parent session can safely poll GitHub itself with bounded backoff because CI is external and the no-polling rule only forbids polling child sessions, not outside systems. [gh api manual](https://cli.github.com/manual/gh_api) [gh pr view manual](https://cli.github.com/manual/gh_pr_view) [GitHub REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) [GitHub webhooks overview](https://docs.github.com/en/webhooks/about-webhooks)

## Ticket and local contract context

Issue #20 asks for concrete mechanics for consuming GitHub CI and PR feedback; map #18 says this decision is part of the Kent-style delivery bridge and explicitly calls out review-ledger schema extension for CI- and PR-sourced findings as still unresolved. [Issue 20](https://github.com/GregM1991/gm-pi-environment/issues/20) [Issue 18](https://github.com/GregM1991/gm-pi-environment/issues/18)

Local repo contracts already establish the shape of review packets and compact verification handoff: `/matt-auto` writes per-issue review packets outside the worktree, hands children only compact summaries plus verification-log paths, and keeps the ledger append-only and prompt-driven. [extensions/matt-workflow-pi-extension/README.md](../../extensions/matt-workflow-pi-extension/README.md) [extensions/matt-workflow-pi-extension/augmentations/auto.md](../../extensions/matt-workflow-pi-extension/augmentations/auto.md) [docs/adr/0003-review-ledger.md](../adr/0003-review-ledger.md)

## Documented facts

### 1. Checks, commit statuses, and required checks are different layers

GitHub’s umbrella term is “status checks,” but there are two underlying mechanisms: **checks** and **commit statuses**. Checks are richer, can include annotations and detailed output, and are produced by GitHub Apps including GitHub Actions; commit statuses are the older, simpler per-commit state published by external services. The PR **Checks** tab is populated only by checks, not by commit statuses. [About status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)

For check runs, the machine state is split into `status` and `conclusion`; valid run statuses include `queued`, `in_progress`, and `completed`, and completed runs can conclude `success`, `failure`, `neutral`, `skipped`, `timed_out`, `action_required`, and others. [Check runs REST](https://docs.github.com/en/rest/checks/runs) [Status checks reference](https://docs.github.com/en/pull-requests/reference/status-checks?apiVersion=2022-11-28)

For commit statuses, the combined-status endpoint reports `failure` if any latest context fails/errors, `pending` if any latest context is pending or if no statuses exist, and `success` only if the latest status for every context is successful. Individual statuses carry fields such as `context`, `state`, `description`, and `target_url`. [Commit statuses REST](https://docs.github.com/en/rest/commits/statuses)

Required checks are branch-protection policy, not observations. Protected branches can require checks or commit statuses, can require the source to be a specific GitHub App, and can require “strict” up-to-date branches before merge. Required checks must succeed on the latest relevant SHA, and `successful`, `skipped`, or `neutral` satisfy the requirement. If a check run and a commit status share the same required name, both must pass. [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks?apiVersion=2022-11-28) [Branch protection REST](https://docs.github.com/en/rest/branches/branch-protection) [GraphQL branches reference](https://docs.github.com/en/graphql/reference/branches)

### 2. `gh` can expose the needed CI surfaces, but `gh api` is the exact mechanism

`gh pr checks` is the cleanest CLI summary surface for CI: it can emit JSON fields `bucket`, `name`, `state`, `workflow`, `link`, `startedAt`, `completedAt`, and can filter to `--required`; its watch mode defaults to 10-second intervals and exits with code `8` while checks are pending. [gh pr checks manual](https://cli.github.com/manual/gh_pr_checks)

`gh pr view --json` can also return `statusCheckRollup`, `reviewDecision`, `reviews`, `comments`, and `files`, but the CLI manual only documents field availability, not the full nested schema. For automation, `gh api` against REST/GraphQL is the more stable contract. [gh pr view manual](https://cli.github.com/manual/gh_pr_view) [gh api manual](https://cli.github.com/manual/gh_api)

Concrete CI reads:

```bash
# PR summary
gh pr view "$PR" --json number,headRefOid,baseRefName,reviewDecision,statusCheckRollup

# exact head SHA
sha=$(gh api repos/{owner}/{repo}/pulls/$PR --jq .head.sha)

# check runs on the head SHA
gh api "repos/{owner}/{repo}/commits/$sha/check-runs" --paginate \
  --jq '.check_runs[] | {name,status,conclusion,details_url,app: .app.slug}'

# combined legacy commit status on the head SHA
gh api "repos/{owner}/{repo}/commits/$sha/status" \
  --jq '{state, statuses: [.statuses[] | {context,state,description,target_url}]}'

# branch-protection required checks for an exact branch
gh api "repos/{owner}/{repo}/branches/$BASE/protection/required_status_checks" \
  --jq '{strict,contexts,checks}'
```

Those commands are direct wrappers around the documented REST endpoints. [gh api manual](https://cli.github.com/manual/gh_api) [Check runs REST](https://docs.github.com/en/rest/checks/runs) [Commit statuses REST](https://docs.github.com/en/rest/commits/statuses) [Branch protection REST](https://docs.github.com/en/rest/branches/branch-protection)

When branch protection is pattern-based rather than an exact branch name, GraphQL is the better source because the GraphQL `BranchProtectionRule` type exposes `pattern`, `requiredStatusCheckContexts`, `requiredStatusChecks`, `requiresStatusChecks`, and `requiresStrictStatusChecks`. [GraphQL branches reference](https://docs.github.com/en/graphql/reference/branches)

### 3. PR review feedback has three distinct machine-readable surfaces

**Review summaries:** REST `pulls/{pull_number}/reviews` returns each review in chronological order, including `state`, `body`, `submitted_at`, `commit_id`, and `user`. This is the right source for approvals vs requested changes vs comments. [Pull request reviews REST](https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28)

**Inline review comments:** REST `pulls/{pull_number}/comments` returns diff-anchored comments with `path`, `line`, `start_line`, `side`, `commit_id`, `pull_request_review_id`, `in_reply_to_id`, `diff_hunk`, and `html_url`. This is the right low-level source for line findings and replies. [Pull request review comments REST](https://docs.github.com/en/rest/pulls/comments?apiVersion=2022-11-28)

**Review threads:** GraphQL `PullRequest.reviewThreads` exposes actual thread semantics, including `isResolved`, `isOutdated`, `path`, `line`, `startLine`, `comments`, and resolver metadata. This is the only high-trust source here that directly answers “is this conversation still unresolved?” at the thread level. [GraphQL pulls reference](https://docs.github.com/en/graphql/reference/pulls)

Concrete commands:

```bash
# quick CLI summary
gh pr view "$PR" --json reviewDecision,reviews,comments,files

# review summaries
gh api "repos/{owner}/{repo}/pulls/$PR/reviews" --paginate \
  --jq '.[] | {id,user: .user.login,state,body,submitted_at,commit_id,html_url}'

# inline comments
gh api "repos/{owner}/{repo}/pulls/$PR/comments" --paginate \
  --jq '.[] | {id,user: .user.login,body,path,line,start_line,side,in_reply_to_id,pull_request_review_id,commit_id,html_url}'

# thread state
gh api graphql -f owner='{owner}' -f name='{repo}' -F number="$PR" -f query='\
query($owner:String!, $name:String!, $number:Int!, $after:String) {\
  repository(owner:$owner, name:$name) {\
    pullRequest(number:$number) {\
      reviewThreads(first:100, after:$after) {\
        nodes {\
          id isResolved isOutdated path line startLine\
          comments(first:100) {\
            nodes { id body createdAt author { login } }\
          }\
        }\
        pageInfo { hasNextPage endCursor }\
      }\
    }\
  }\
  rateLimit { cost remaining resetAt }\
}' --paginate --slurp
```

The GraphQL call must paginate connections and keep `first`/`last` within 1-100; GitHub also caps a single query at 500,000 nodes. [gh api manual](https://cli.github.com/manual/gh_api) [GraphQL rate limits and query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api) [GraphQL pulls reference](https://docs.github.com/en/graphql/reference/pulls)

### 4. Bot findings can arrive either as checks or as PR comments

Checks can carry annotations attached to exact files/lines, and the annotation list is available via `GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations`. Each annotation includes fields such as `path`, `start_line`, `end_line`, `annotation_level`, `message`, and `raw_details`. [Check runs REST](https://docs.github.com/en/rest/checks/runs)

That gives a concrete bot-finding path:

```bash
run_id=$(gh api "repos/{owner}/{repo}/commits/$sha/check-runs" --jq '.check_runs[] | select(.conclusion != "success") | .id')
gh api "repos/{owner}/{repo}/check-runs/$run_id/annotations" --paginate
```

Bot review tools that comment directly on the PR instead of using checks appear in the same review/comment/thread APIs as humans, so the consumer should not special-case “bot” by transport. Instead, classify evidence by source: `check-run`, `commit-status`, `review-thread`, `review-comment`, or `review-summary`, and preserve the reported author/app fields. [Check runs REST](https://docs.github.com/en/rest/checks/runs) [Pull request reviews REST](https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28) [Pull request review comments REST](https://docs.github.com/en/rest/pulls/comments?apiVersion=2022-11-28)

### 5. GitHub’s documented wait strategy is webhook-first, polling-second

GitHub explicitly recommends subscribing to webhooks instead of polling the API, because webhooks reduce load, scale better, and provide near-real-time updates. GitHub also recommends subscribing only to the minimum events needed, responding within 10 seconds, queueing work asynchronously, validating the webhook secret, and deduplicating/replaying with `X-GitHub-Delivery`. [Webhooks overview](https://docs.github.com/en/webhooks/about-webhooks) [Webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)

If polling is necessary, GitHub recommends polling on a fixed schedule, honoring `x-poll-interval` when present, using authenticated conditional requests with `ETag` / `If-None-Match`, avoiding concurrent requests, and backing off on `retry-after`, `x-ratelimit-reset`, or at least one minute for secondary limits. Correctly authorized `304 Not Modified` responses do not count against the primary REST rate limit. [REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

### 6. Rate-limit headroom is large for this single-user bridge

Authenticated REST requests made with a personal access token share a 5,000-requests-per-hour user limit. GraphQL has a separate 5,000-points-per-hour user limit. Secondary limits also matter: no more than 100 concurrent requests overall, about 900 REST points/minute, and about 2,000 GraphQL points/minute. [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) [GraphQL rate limits and query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)

## Recommendations for Pi

### A. Recommended CI consumption path

1. **Resolve PR metadata once**: `gh pr view --json number,headRefOid,baseRefName,reviewDecision` or `gh api repos/{owner}/{repo}/pulls/$PR`.
2. **Read required checks separately from observed results**.
   - Exact branch: REST `branches/$BASE/protection/required_status_checks`.
   - Pattern rules / future ruleset nuance: GraphQL branch protection rules.
3. **Read observed results on the head SHA**.
   - Check runs: `commits/$sha/check-runs`
   - Legacy statuses: `commits/$sha/status`
4. **Normalize** into one internal list with fields like `kind`, `name`, `app`, `status`, `conclusionOrState`, `required`, `detailsUrl`, `sourceSha`.
5. **Escalate to annotations only for failing/suspicious checks** to keep requests cheap.

Why: required-check policy and current results are separate API surfaces, and GitHub’s duplicate-name rule means Pi must model checks and commit statuses independently rather than collapsing on display name alone. [Branch protection REST](https://docs.github.com/en/rest/branches/branch-protection) [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks?apiVersion=2022-11-28)

### B. Recommended PR-feedback consumption path

1. **Fast gate**: `gh pr view --json reviewDecision,reviews,comments,statusCheckRollup` for quick human-readable state.
2. **Canonical review state**:
   - review summaries from REST reviews
   - unresolved/outdated thread state from GraphQL `reviewThreads`
   - inline comment locations from REST PR comments
3. **Bot findings**:
   - prefer check annotations when the bot publishes checks
   - otherwise treat bot PR comments as ordinary review-thread evidence
4. **Fresh-review-child handoff** should include only unresolved threads and still-actionable bot findings, not the whole comment history.

Why: `reviewDecision` alone loses the per-thread actionable detail, while REST comments alone lose resolution state. Using both GraphQL threads and REST comment detail matches GitHub’s data model. [gh pr view manual](https://cli.github.com/manual/gh_pr_view) [GraphQL pulls reference](https://docs.github.com/en/graphql/reference/pulls) [Pull request review comments REST](https://docs.github.com/en/rest/pulls/comments?apiVersion=2022-11-28)

### C. Recommended wait strategy compatible with the auto contract

**Documented fact:** GitHub prefers webhooks over polling. [Webhooks overview](https://docs.github.com/en/webhooks/about-webhooks) [REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)

**Recommendation for this repo now:**

- **Near term:** let the parent session poll GitHub directly because CI is external and the local no-polling contract only forbids polling child sessions. Poll only the active PR under management, not broad repo state.
- **Cadence:** 15s for the first 2 minutes, 30s until 10 minutes, then 60s capped; stop immediately on a terminal state.
- **Data per poll:** one CI summary call (`gh pr checks --json bucket,name,state,link --required` or equivalent `gh api` pair). Only fetch review threads/comments when CI settles or when a webhook/event indicates new review feedback.
- **Backoff/error behavior:** on `retry-after`, wait exactly that long; on primary exhaustion, wait until `x-ratelimit-reset`; on secondary limit without `retry-after`, wait at least 60s then exponential backoff.
- **Future state:** move to webhook-triggered wakeups through the planned gateway MCP and retain polling only as recovery/reconciliation.

This is a recommendation, not a GitHub-documented cadence. The cadence is chosen because it is responsive during the common “Actions still running” window while staying tiny relative to a 5,000 req/h token budget.

### D. Rate-limit math for the recommended cadence

Assume the parent polls one active PR with **1 request per poll** using `gh pr checks --json ... --required`:

- first 2 minutes at 15s = 8 requests
- next 8 minutes at 30s = 16 requests
- remaining 50 minutes at 60s = 50 requests
- **worst sustained hour ≈ 74 requests/hour per active PR**

At the authenticated REST limit of 5,000 req/h, that is about **1.5%** of the hourly budget for one active PR. Even if Pi used **2 requests per poll** (for example, separate check-runs plus combined-status reads), that is about **148 req/h**, or about **3.0%** of the hourly budget for one active PR. [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

For review threads, a small GraphQL query typically costs at least 1 point, and GitHub exposes `rateLimit { cost remaining resetAt }` so Pi can log actual cost and adjust if queries grow. [GraphQL rate limits and query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)

### E. Compact evidence packet schema for fresh review children

This should extend the repo’s existing compact-packet discipline rather than dumping raw CI/log output. [extensions/matt-workflow-pi-extension/README.md](../../extensions/matt-workflow-pi-extension/README.md) [extensions/matt-workflow-pi-extension/augmentations/auto.md](../../extensions/matt-workflow-pi-extension/augmentations/auto.md)

**Recommended schema (ephemeral packet JSON or embedded fenced JSON inside the existing markdown packet):**

```json
{
  "issue": 123,
  "pr": {
    "number": 456,
    "url": "https://github.com/OWNER/REPO/pull/456",
    "headSha": "abc123",
    "baseRef": "main",
    "reviewDecision": "CHANGES_REQUESTED",
    "mergeStateStatus": "BLOCKED"
  },
  "requiredChecks": {
    "strict": true,
    "items": [
      {"name": "test", "app": "github-actions", "kind": "check-run"},
      {"name": "ci/lint", "app": null, "kind": "commit-status"}
    ]
  },
  "ci": {
    "summary": {"requiredTotal": 2, "passing": 1, "failing": 1, "pending": 0},
    "blocking": [
      {
        "kind": "check-run",
        "name": "test",
        "app": "github-actions",
        "status": "completed",
        "conclusion": "failure",
        "detailsUrl": "https://github.com/OWNER/REPO/actions/runs/...",
        "findings": [
          {
            "path": "src/foo.ts",
            "startLine": 42,
            "endLine": 42,
            "level": "failure",
            "message": "Type mismatch",
            "details": "..."
          }
        ]
      }
    ]
  },
  "reviews": {
    "summary": {"approvals": 1, "changesRequested": 1, "unresolvedThreads": 2},
    "blockingThreads": [
      {
        "threadId": "PRRT_xxx",
        "path": "src/foo.ts",
        "line": 42,
        "isResolved": false,
        "isOutdated": false,
        "comments": [
          {"author": "reviewer1", "body": "Please handle null input.", "createdAt": "2026-..."},
          {"author": "copilot-pull-request-reviewer", "body": "Possible null dereference.", "createdAt": "2026-..."}
        ]
      }
    ]
  },
  "evidenceRefs": {
    "verificationLogPath": ".pi/matt-verification/123-fix-1.log",
    "packetPath": "/tmp/matt-auto-review-packets/.../123.md",
    "refreshCommands": [
      "gh pr checks 456 --json bucket,name,state,link --required",
      "gh api repos/{owner}/{repo}/pulls/456/comments --paginate",
      "gh api graphql ...reviewThreads..."
    ]
  }
}
```

**Why this shape:** it preserves the packet discipline already documented locally, keeps children focused on unresolved/actionable evidence, and gives them exact refresh commands instead of raw logs. [extensions/matt-workflow-pi-extension/augmentations/auto.md](../../extensions/matt-workflow-pi-extension/augmentations/auto.md)

## Alternatives and tradeoffs

### Alternative 1: rely mostly on `gh pr checks` and `gh pr view`

Pros: simplest CLI surface. [gh pr checks manual](https://cli.github.com/manual/gh_pr_checks) [gh pr view manual](https://cli.github.com/manual/gh_pr_view)

Cons: CLI JSON field docs are thinner than the underlying API docs, `statusCheckRollup` is less explicit than reading check-runs/status endpoints directly, and `gh pr view` does not replace GraphQL thread state for unresolved conversations.

### Alternative 2: REST only, no GraphQL

Pros: simpler auth story; all needed endpoints exist for reviews/comments/checks.

Cons: REST lacks first-class review-thread resolution semantics, so Pi would have to reconstruct threads heuristically from comments and replies. That is weaker than GraphQL `reviewThreads`. [Pull request review comments REST](https://docs.github.com/en/rest/pulls/comments?apiVersion=2022-11-28) [GraphQL pulls reference](https://docs.github.com/en/graphql/reference/pulls)

### Alternative 3: webhook-first immediately

Pros: best match for GitHub guidance; lower API usage; faster external wakeups. [Webhooks overview](https://docs.github.com/en/webhooks/about-webhooks)

Cons: this repo’s own map says gateway MCP shape and trigger wiring are still undecided, so an immediate webhook dependency would front-run other open Wayfinder decisions. [Issue 18](https://github.com/GregM1991/gm-pi-environment/issues/18)

## Uncertainties

1. This investigation did not resolve the repo’s future review-ledger schema for PR- and CI-sourced findings; map #18 explicitly leaves that open and it overlaps issue #9. [Issue 18](https://github.com/GregM1991/gm-pi-environment/issues/18)
2. GitHub’s CLI docs do not fully document the nested `statusCheckRollup` JSON schema, so packet generation should avoid depending on undocumented subfields when exactness matters. [gh pr view manual](https://cli.github.com/manual/gh_pr_view)
3. Branch protection docs here cover classic branch protection; if the bridge later needs full rulesets parity, that should be researched separately.

## Implications for later Wayfinder tickets

1. **Review-ledger extension work** should likely add new provenance classes for GitHub-native evidence, but only after deciding whether PR/CI findings are ledgered as first-class sources or merely included in ephemeral review packets. This directly overlaps the open record-shape work noted in map #18 and ADR 0003’s provenance rules. [Issue 18](https://github.com/GregM1991/gm-pi-environment/issues/18) [docs/adr/0003-review-ledger.md](../adr/0003-review-ledger.md)
2. **Gateway MCP / headless trigger work** should be designed webhook-first, with polling as reconciliation fallback. [Webhooks overview](https://docs.github.com/en/webhooks/about-webhooks) [Webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
3. **Auto-loop PR delivery design** should keep CI result collection separate from required-check policy evaluation; collapsing them will mis-handle duplicate names and app-specific required checks. [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks?apiVersion=2022-11-28) [Branch protection REST](https://docs.github.com/en/rest/branches/branch-protection)
4. **Child review handoffs** can reuse the existing compact review-packet discipline with one added JSON block for PR/CI evidence instead of inventing a second artifact type. [extensions/matt-workflow-pi-extension/README.md](../../extensions/matt-workflow-pi-extension/README.md)
