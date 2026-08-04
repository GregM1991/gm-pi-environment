# GitHub API guarantees for deterministic tracker operations

## Scope and conclusion

This investigation answers GitHub issue [#37](https://github.com/GregM1991/gm-pi-environment/issues/37), under map [#35](https://github.com/GregM1991/gm-pi-environment/issues/35). It covers only the GitHub Adapter boundary for bounded tracker operations. Sources are GitHub's REST and GraphQL documentation, GitHub's published schemas, and the GitHub CLI manual.

**Conclusion:** GitHub supplies well-defined resource endpoints, stable numeric/node IDs, pagination mechanisms, permission requirements, response status codes, and rate-limit signals. It does **not** document a transaction, compare-and-swap precondition, write ETag, expected `updated_at`, or general mutation idempotency key for these issue operations. A deterministic adapter therefore has to provide determinism above the API: explicit API versioning, complete pagination, normalized identities, read-before-write for state-dependent changes, narrow mutations, postcondition verification, reconciliation after ambiguous outcomes, and conditional compensation for multi-call operations.

## Baseline contract for the adapter

1. Prefer the versioned REST endpoints for the v1 adapter. Send `Accept: application/vnd.github+json` and an explicit `X-GitHub-Api-Version: 2022-11-28`; GitHub recommends both headers and documents its date-based version policy.[S1][S2]
2. Address repositories by owner/name at the HTTP boundary, but retain GitHub's immutable issue `id` and GraphQL `node_id` in domain results. Numbers are repository-local and a transferred issue can return `301 Moved Permanently`; deletion can be `410 Gone` for a caller that can read the repository, while inaccessible transferred/deleted resources can be masked as `404 Not Found`.[S3]
3. Treat issue-list responses as a moving enumeration, not a snapshot. Repository issue endpoints also return pull requests, identifiable by the `pull_request` key, and default to open issues unless `state` is supplied.[S3]
4. Return structured evidence for every mutation: requested change, observed pre-state (when read), HTTP status/request ID, returned resource, verified post-state, and whether the outcome is `applied`, `already-satisfied`, `rejected`, `conflict`, `rate-limited`, `transient-failure`, or `unknown-outcome`.
5. Do not infer atomicity across calls. Use a saga: record each confirmed step and its conditional inverse. Compensate only if the current value still equals the value this operation wrote; otherwise report a conflict rather than overwriting another actor.

## Operation guarantees and required safeguards

| Area | Official surface and guarantees | Deterministic adapter requirement |
|---|---|---|
| Read one issue | `GET /repos/{owner}/{repo}/issues/{issue_number}` returns an issue or documented `301`, `304`, `404`, or `410`. Issue responses expose `updated_at`, IDs, state, labels, and assignees.[S3][S16] | Follow an allowed same-GitHub redirect and update canonical coordinates. Distinguish a pull request by `pull_request`. Preserve response headers (`ETag`, request ID). A masked `404` is not proof of nonexistence. |
| List issues | `GET /repos/{owner}/{repo}/issues` supports filters including `state`, `labels`, `assignee`, `since`, sorting, and pagination; it includes pull requests and defaults to open issues.[S3] | Always set filters and sort explicitly, traverse every page, deduplicate by immutable `id`, then apply a deterministic local order. Do not claim snapshot consistency: concurrent inserts/updates can move page boundaries. For a consistency-sensitive scan, record a start watermark, reconcile changed items, and/or repeat until the relevant ID/`updated_at` projection stabilizes. |
| Labels | List, additive `POST`, replacing `PUT`, remove-one `DELETE`, and remove-all endpoints are documented. `PUT` replaces the entire set; remove-one returns `404` when the label does not exist.[S4][S16] | Prefer additive/removal endpoints over replacement. For `ensure present/absent`, read first so an already-satisfied request is a no-op and a removal `404` is not confused with an inaccessible issue. For exact-set replacement, read the full set, compare an expected-set fingerprint immediately before writing, then verify; because GitHub has no atomic precondition, a residual race remains. Compensation restores only labels owned by the failed workflow, not an indiscriminate old full set. |
| Assignees | Add/remove endpoints accept arrays; add supports up to ten assignees and does not replace existing assignees. The schema warns that unauthorized/ineligible assignees can be silently ignored; GitHub also exposes a “check if a user can be assigned” endpoint.[S5][S16] | Preflight eligibility when useful, read before mutation, and always verify the returned/re-read assignee set. Classify a silently omitted requested login as `rejected`, not success. Treat the set as case-normalized GitHub logins and avoid full-set emulation. Compensation removes only assignees this operation confirmed it added (or re-adds only those it confirmed it removed). |
| Comments | List comments is ordered by ascending ID. Create returns `201`; update and delete address a stable comment ID. Creating comments triggers notifications and can trigger secondary rate limiting.[S6][S16] | Listing must paginate. Comment creation is non-idempotent: place an adapter operation marker in the body or durable local ledger, and after timeout/5xx search/reconcile before retrying. Keep the returned comment ID. Update requires pre-read/body hash and post-read verification; delete requires pre-read if compensation is needed. A failed delete retry yielding `404` is an ambiguous/already-absent result unless the prior response was observed. Re-creating a deleted comment is not an exact inverse (new ID, timestamp, notifications). |
| Close/reopen | `PATCH /issues/{issue_number}` accepts absolute `state: open|closed`; `state_reason` is ignored unless state changes. Current schema reasons include `completed`, `not_planned`, `duplicate`, and `reopened`.[S3][S16] | Read state and reason first. Return `already-satisfied` without writing when appropriate. Send only `state` and the intended reason, then verify both. Preserve the prior state/reason for possible compensation, but reverse only when the issue still has the post-state written by this operation. Concurrent state changes cannot be excluded atomically. |
| Sub-issues | REST can get parent, list sub-issues, add by global `sub_issue_id`, remove, and reprioritize. Add requires the child to belong to the same repository owner; `replace_parent` explicitly permits replacing its current parent. Reprioritize uses `before_id` or `after_id`.[S7][S16] | Read the child's current parent and the parent's complete ordered children first. Default `replace_parent` to false; require an explicit expected old parent to move a child. Verify parent and order afterward. Reprioritization must carry an expected sibling-order fingerprint and report conflict if it changed before the request; there is still a race between check and write. Compensation for a move restores the old parent and best-effort position only if neither relation has changed. |
| Dependencies | REST can list `blocked_by` and `blocking`, add a `blocked_by` relation by global issue ID, and remove it. Create documents `201` plus `403/404/410/422`; removal documents `200` plus `400/401/403/404/410`.[S8][S16] | Fully list before add/remove. Return `already-satisfied` for a present add or absent remove. Check obvious self/cycle/domain invariants locally but let `422` remain authoritative for GitHub validation. Verify both directional views after mutation. On ambiguous create/remove outcomes, reconcile before retry. Compensation applies the inverse only if the relation still has the operation's expected post-state. |

### Why narrow operations matter

The general issue update endpoint can also replace labels and assignees. Its schema explicitly says label arrays replace the current labels and that unauthorized label/milestone changes may be silently dropped.[S16] The adapter should therefore expose semantic operations such as `ensureLabel`, `ensureAssignee`, and `transitionIssue`, not a generic “patch issue.” Narrow endpoints reduce lost updates and make postconditions and compensation identifiable, but they still do not make the read/write sequence atomic.

## Concurrency and conflict detection

GitHub documents conditional **GET** requests using `If-None-Match`/`If-Modified-Since`; a correctly authorized `304 Not Modified` does not count against the primary rate limit.[S9] Neither the issue REST operations/OpenAPI schema nor GraphQL `UpdateIssueInput` documents `If-Match`, an expected version, or an expected `updated_at` write precondition.[S16][S17] GraphQL's `clientMutationId` is an echoed correlation field, not a documented deduplication key.[S17]

Consequences:

- Two full-set writers can lose one another's label/order changes. Last accepted write wins; the API gives no documented CAS guarantee.
- `updated_at`, ETag, or a canonical fingerprint can detect many conflicts by “read → compare expected → write → verify,” but cannot close the race between compare and write.
- Serialize operations per issue inside one adapter process, while assuming other clients remain concurrent.
- Prefer commutative set-member endpoints and minimal PATCH bodies. Require callers to supply expected pre-state for destructive/replacing/order-sensitive operations.
- Re-read after every mutation. If an unrelated actor changed the same field, return `conflict` with observed state; do not silently retry a replacement.
- For cross-resource workflows, record confirmed steps and conditional compensators. There is no documented multi-request transaction or rollback.

## Authentication and authorization

REST supports GitHub App installation/user access tokens and fine-grained personal access tokens; endpoint documentation states the required fine-grained repository permission. Read operations generally require **Issues: read**, mutations **Issues: write**; public resources may be readable without authentication. Classic token access depends on scopes and repository access. GitHub recommends `Authorization: Bearer …` (or `token` for JWT) and returns `401` for bad credentials; repeated bad credentials can temporarily produce `403`.[S10]

The adapter must:

- never accept or log a token as a normal operation argument; use the host credential provider/`gh auth`;
- preflight authenticated identity and repository access without broadening permissions;
- distinguish authentication failure from authorization failure and from a privacy-masked `404`;
- request the least privilege needed, with separate read-only and mutation-capable configurations where practical;
- never treat HTTP success alone as authorization success for fields GitHub documents as silently ignored (notably assignees and some issue-update fields); verify the postcondition.

## Pagination and ordering

REST paginated responses use the `Link` header; many endpoints default to 30 items and support `per_page` up to 100. Clients should follow the provided `rel="next"` URL rather than constructing page numbers.[S11] GraphQL connections require `first` or `last` in the range 1–100 and cursor traversal via `pageInfo.endCursor`/`hasNextPage` (or the reverse equivalents).[S12]

For deterministic results, the adapter should:

1. set the maximum supported page size and follow links/cursors to exhaustion;
2. bound total pages/items/time and return an explicit incomplete result rather than a partial list presented as complete;
3. deduplicate immutable IDs and apply a canonical local sort with ID as the final tie-breaker;
4. preserve whether the server truncated or the adapter stopped;
5. recognize that pagination is not snapshot isolation—repeat/reconcile when concurrent changes matter.

`gh api --paginate` follows REST pagination and, for GraphQL, requires the query to expose `$endCursor` and `pageInfo { hasNextPage, endCursor }`; `--slurp` can combine pages.[S15] Porcelain commands such as `gh issue list` have their own `--limit` behavior and should not be the adapter's completeness boundary.[S19]

## Rate limits and retries

GitHub documents primary REST limits (including 60 requests/hour unauthenticated and typically 5,000/hour authenticated) and separate GraphQL point limits. It also documents secondary limits, including shared REST/GraphQL concurrency, point budgets, CPU-time constraints, and content-creation constraints; these limits can change without notice.[S13][S14]

Classification/retry policy:

- Read `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-used`, `x-ratelimit-reset`, and `x-ratelimit-resource` on REST responses. Use GraphQL `rateLimit`/headers for GraphQL.
- On `403` or `429`, honor `retry-after`; if primary remaining is zero, wait until `x-ratelimit-reset`; otherwise apply bounded exponential backoff as GitHub directs. Continuing while rate-limited can lead to integration bans.[S13]
- Cache immutable/reference reads and use conditional GETs where appropriate. Do not cache authorization-sensitive absence across credentials.
- Mutation retries need a total deadline and reconciliation. Never blindly retry comment creation or another non-idempotent POST after a network timeout or 5xx.
- Surface budget exhaustion/rate limiting as typed results so orchestration can pause rather than mutate partially.

## Idempotency and ambiguous outcomes

GitHub does not document a general `Idempotency-Key` facility for these operations.[S3–S8][S16] HTTP method shape alone is insufficient for workflow idempotency.

| Operation shape | Safe interpretation |
|---|---|
| GET/list | Side-effect free, but lists can drift while paginating. |
| Absolute PATCH (state/body) | Repeating the same payload is convergent only absent concurrent writers and extra server effects; reconcile first after an unknown response. |
| Exact-set PUT | Convergent to that set but can clobber concurrent additions, so it is not safe automatic retry under contention. |
| Set-member add/remove | Build `ensure present/absent` with pre-read and post-read. Do not depend on undocumented duplicate handling. |
| Create comment | Non-idempotent. Use an operation marker/ledger and reconcile before retry. |
| Delete comment | Repeated absence is a useful desired postcondition, but `404` cannot prove which attempt deleted it or whether access is masked. |
| Add/move sub-issue or dependency | State-dependent; pre-read and reconcile after ambiguous outcomes. `replace_parent` is never an implicit retry policy. |
| GraphQL mutation | `clientMutationId` correlates response and request; no first-party documentation says it deduplicates retries.[S17] |

A timeout, connection reset, proxy failure, or `5xx` after sending a mutation means **unknown outcome**, not “failed without side effect.” The next action is a read keyed by resource ID or operation marker. Only retry when the read proves the postcondition was not applied and doing so remains safe.

## Error classification

GitHub's troubleshooting guide defines common REST meanings and warns that `404` may intentionally conceal a private resource. Endpoint schemas add operation-specific statuses.[S18][S16]

| Signal | Adapter class | Handling |
|---|---|---|
| `200/201/204` | accepted | Still verify semantic postcondition for mutations. |
| `301` | relocated | Follow safely, record new canonical owner/repo/number, and protect against redirect loops. |
| `304` | unchanged read | Use cached representation associated with the validator. |
| `400` | invalid request | Permanent caller/schema error unless endpoint evidence says otherwise. |
| `401` | unauthenticated | Refresh/re-authenticate once; do not retry indefinitely. |
| `403` | forbidden or rate-limited | Inspect headers/body. Separate permission denial, secondary limit, and temporary bad-credential lockout. |
| `404` | absent **or concealed** | Re-check coordinates and credential access. For ensure-remove, report ambiguity unless prior authorized state proves absence. |
| `410` | gone | Terminal resource state for that canonical location; preserve deletion/transfer context when known. |
| `422` | validation/spam/state rejection | Usually caller/state error. Re-read once when a concurrent relation/state change could explain it; otherwise do not retry. |
| `429` | rate-limited | Honor server timing and pause. |
| `5xx` or network failure | transient, mutation outcome possibly unknown | Back off reads; reconcile mutations before any retry. |

GraphQL can return HTTP `200` with an `errors` array and partial `data`; the adapter must inspect both and must not call a mutation successful when the relevant response path has an error.[S20] Normalize GraphQL failures into the same domain classes while preserving the original error path/type/message and request ID.

## REST, GraphQL, and CLI boundary choice

GraphQL provides typed connections and mutations, but still requires cursor pagination, point-budget accounting, and application-level inspection of partial errors. Its published schema confirms issue mutation inputs but no optimistic-concurrency field.[S12][S14][S17] REST is the clearer v1 contract because the researched relationship endpoints and their operation-specific HTTP statuses are directly documented and present in GitHub's OpenAPI description.[S7][S8][S16]

If the implementation shells through `gh`, use `gh api`, not `gh issue` porcelain, as the stable adapter boundary: pin the REST version header, pass typed JSON input, capture status/headers/body, and explicitly paginate.[S15] `gh issue view/list/edit/close/reopen/comment` are useful human interfaces, but their manuals promise flags and output—not transactionality, conflict detection, complete pagination by default, or idempotency.[S19] CLI exit status alone loses the error distinctions required above.

## Residual uncertainties requiring a prototype or product decision

1. GitHub documents endpoint behavior but not snapshot isolation or a formal consistency window. A read-after-write verification prototype should measure propagation for sub-issue/dependency directional views without promoting observations into guarantees.
2. First-party docs do not promise duplicate-request semantics for every additive relationship endpoint. The adapter must retain read-before-write rather than treating observed duplicate behavior as contractual.
3. GitHub's published OpenAPI description evolves and currently contains fields beyond the conservative operation subset above. Generation should pin a reviewed schema commit/API version and detect drift; do not silently inherit new fields.
4. The desired operation-marker format/storage for exactly-once-like comment creation is a domain decision. Embedding a hidden marker affects user content; a local ledger is not sufficient across machines unless shared.
5. No documented primitive can make exact label-set replacement or sub-issue ordering atomic against other GitHub clients. The product contract must explicitly allow `conflict`/best-effort semantics rather than promise serializability.
6. Fine-grained token availability and some issue-feature behavior can vary by repository/organization/enterprise policy. Capability preflight and typed `unsupported/forbidden` results remain necessary.

## Primary sources

All sources are first-party and were consulted for this investigation.

- **[S1]** GitHub Docs, “Getting started with the REST API” (recommended `Accept` and version headers): https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api
- **[S2]** GitHub Docs, “API Versions”: https://docs.github.com/en/rest/about-the-rest-api/api-versions
- **[S3]** GitHub REST, “REST API endpoints for issues”: https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28
- **[S4]** GitHub REST, “REST API endpoints for labels”: https://docs.github.com/en/rest/issues/labels?apiVersion=2022-11-28
- **[S5]** GitHub REST, “REST API endpoints for assignees”: https://docs.github.com/en/rest/issues/assignees?apiVersion=2022-11-28
- **[S6]** GitHub REST, “REST API endpoints for issue comments”: https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28
- **[S7]** GitHub REST, “REST API endpoints for sub-issues”: https://docs.github.com/en/rest/issues/sub-issues?apiVersion=2022-11-28
- **[S8]** GitHub REST, “REST API endpoints for issue dependencies”: https://docs.github.com/en/rest/issues/issue-dependencies?apiVersion=2022-11-28
- **[S9]** GitHub Docs, “Best practices for using the REST API,” conditional requests: https://docs.github.com/en/rest/guides/best-practices-for-using-the-rest-api#use-conditional-requests-if-appropriate
- **[S10]** GitHub Docs, “Authenticating to the REST API”: https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api
- **[S11]** GitHub Docs, “Using pagination in the REST API”: https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api
- **[S12]** GitHub Docs, “Using pagination in the GraphQL API”: https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api
- **[S13]** GitHub Docs, “Rate limits for the REST API”: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- **[S14]** GitHub Docs, “Rate limits and query limits for the GraphQL API”: https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api
- **[S15]** GitHub CLI manual, `gh api`: https://cli.github.com/manual/gh_api
- **[S16]** GitHub, official REST OpenAPI description (`github/rest-api-description`): https://github.com/github/rest-api-description/blob/main/descriptions/api.github.com/api.github.com.json and raw schema https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json
- **[S17]** GitHub, published GraphQL schema and `updateIssue` reference: https://docs.github.com/public/fpt/schema.docs.graphql and https://docs.github.com/en/graphql/reference/mutations#updateissue
- **[S18]** GitHub Docs, “Troubleshooting the REST API”: https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api
- **[S19]** GitHub CLI issue manuals: https://cli.github.com/manual/gh_issue_view, https://cli.github.com/manual/gh_issue_list, https://cli.github.com/manual/gh_issue_edit, https://cli.github.com/manual/gh_issue_close, https://cli.github.com/manual/gh_issue_reopen, and https://cli.github.com/manual/gh_issue_comment
- **[S20]** GitHub Docs, “Forming calls with GraphQL”: https://docs.github.com/en/graphql/guides/forming-calls-with-graphql
