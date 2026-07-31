# Investigation: AI review options for PRs

## Scope

Ticket: [AI review options for PRs](https://github.com/GregM1991/gm-pi-environment/issues/22)  
Map: [Kent-style delivery bridge for the Matt workflow](https://github.com/GregM1991/gm-pi-environment/issues/18)

Read local sources named by the map:

- `extensions/matt-workflow-pi-extension/README.md`
- `extensions/matt-workflow-pi-extension/augmentations/auto.md`
- `docs/adr/0003-review-ledger.md`

Also inspected local review tooling/contracts:

- `/home/gm/.config/opencode/commands/review-w-opencode.md`
- `/home/gm/.config/opencode/agents/code-reviewer.md`
- `extensions/matt-workflow-pi-extension/conventions/types.ts`
- `extensions/matt-workflow-pi-extension/conventions/config.ts`
- `extensions/matt-workflow-pi-extension/review-ledger/schema.ts`
- `extensions/matt-workflow-pi-extension/review-ledger/schema.test.ts`
- `extensions/matt-workflow-pi-extension/auto-loop.test.ts`

## Executive recommendation

For this single-user, home-lab setup, **do not adopt CodeRabbit or GitHub Copilot code review as the primary PR review mechanism right now**. Use **fresh reviewer children plus the existing `aiGate` contract**, and make the delivery bridge post their normalized findings back to the PR as **GitHub review comments plus one summary/check artifact**.

That recommendation follows from four facts:

1. **The existing local workflow already has most of the review contract you need.** The Matt extension already distinguishes `review-child` vs `ai-gate`, requires `file:line` locations, verdicts, severities, summaries, categories, repeat tracking, and deterministic AI-gate mapping in the review ledger contract (`README.md`, `augmentations/auto.md`, `schema.ts`).
2. **CodeRabbit free is not enough for private-repo PR review on GitHub.** Its free plan is positioned as PR summarization plus IDE/CLI reviews, while GitHub PR review capability sits in the paid product/trial surface; official pricing currently shows Free at `$0`, Pro at `$24/user/month` billed annually, and Pro Plus at `$48/user/month` billed annually, with public-repo reviews free forever. <https://www.coderabbit.ai/pricing>
3. **GitHub Copilot code review is the cleanest off-the-shelf GitHub-native PR surface, but it adds subscription cost and uses GitHub Actions runners for its agentic code-review capabilities.** Official docs say Copilot code review leaves GitHub review comments, always as a non-blocking `Comment` review, and uses GitHub Actions for agentic capabilities; official pricing currently shows code review included from Copilot Pro upward at `$10/user/month` for Pro, `$39/user/month` for Pro+, and `$100/user/month` for Max. <https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review> <https://github.com/features/copilot/plans>
4. **Running your own gate as a PR check is the best fit for the repo’s stated rails and home-lab preference**, because GitHub supports self-hosted runners, check runs, pull-request review comments, and SARIF/code-scanning upload as machine-readable surfaces. <https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners> <https://docs.github.com/en/rest/checks/runs> <https://docs.github.com/en/rest/pulls/comments> <https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github>

## What exists already locally

### 1) `review-w-opencode` is already a review command, but its output contract is human-structured, not yet repo-machine-native

`/home/gm/.config/opencode/commands/review-w-opencode.md` defines a comprehensive read-only review command that:

- reviews current diff / staged diff / latest commit,
- can deploy specialized review sub-agents,
- evaluates security, correctness, performance, architecture, standards, and testing,
- emits a structured markdown report with sections for critical / important / minor issues and `file:line` references.

`/home/gm/.config/opencode/agents/code-reviewer.md` reinforces the same contract.

**Implication:** this already gives you a good reviewer, but not a canonical machine schema. It is parseable, not guaranteed-machine-readable.

### 2) `aiGate` is already a first-class concept in the Matt workflow contract

The extension README and local schema establish that `toolchain.commands.aiGate` is an optional repo convention command in `.pi/matt-conventions.json`, and that `/matt-auto` runs it once per issue after the review has passed and the issue commit exists (`extensions/matt-workflow-pi-extension/README.md`, `augmentations/auto.md`).

The local schema is already much more machine-oriented than `review-w-opencode` output. It defines:

- sources: `review-child` and `ai-gate`
- verdicts: `PASS`, `FIX`, `BLOCKER`
- categories: `spec-miss`, `correctness`, `test-gap`, `convention-violation`, `architecture`, `verification-skipped`
- duplicate suppression by normalized `location + summary/evidence`
- AI-gate disposition mapping: `must-fix` / `should-fix` / `non-remediable-blocker`

See:

- `extensions/matt-workflow-pi-extension/review-ledger/schema.ts`
- `extensions/matt-workflow-pi-extension/review-ledger/schema.test.ts`
- `docs/adr/0003-review-ledger.md`

**Important local finding:** this repo currently has **no** `.pi/matt-conventions.json`, so there is **no repo-local `aiGate` command configured yet**. The contract exists; the repo-specific gate wiring does not.

### 3) Reviewer children plus aiGate already nearly satisfy the PR-review need

The open question in issue #22 is not “can the workflow review code?”; it already can. The actual gap is: **how should those findings be landed onto a PR in a machine-readable GitHub surface?**

That bridge is smaller than adopting a new SaaS reviewer.

## Option comparison

| Option | What lands on the PR | Machine-readable surface | Incremental cost | Integration cost | Fit for this setup |
| --- | --- | --- | --- | --- | --- |
| CodeRabbit free / paid | CodeRabbit review comments/threads; PR summary updates | GitHub PR review comments and PR body are API-readable; vendor-specific comment text | Free tier insufficient for private PR review workflow; paid starts at `$24/user/month` billed annually | Low | Weak: extra SaaS + extra cost |
| GitHub Copilot code review | Copilot review comments; always `Comment` review | Native GitHub review comments via API | Starts at Copilot Pro `$10/user/month` | Low-Medium | Better than CodeRabbit, but still extra cost + cloud-run agentic review |
| Existing `aiGate` as PR check | Check run status, summary, annotations; optionally SARIF/code scanning | Checks API, annotations URL, code-scanning alerts | Near-zero software cost; own runner cost only | Medium | Strong |
| Reviewer children + aiGate posted as PR comments | Review comments/threads and/or summary comment in your own schema | GitHub PR review comments API; optionally top-level comment + check | Near-zero software cost | Medium | **Strongest overall** |

## Findings

### 1) CodeRabbit free tier is a poor fit for this repo’s private single-user PR-review need

Official pricing currently shows:

- **Free**: `$0/user/month`, includes a 14-day Pro Plus trial, “Unlimited public and private repositories,” “PR summarization,” and “Reviews in IDE/CLI”
- **Pro**: `$24/user/month` billed annually
- **Pro Plus**: `$48/user/month` billed annually
- public repositories can get “free reviews forever” after installing CodeRabbit on a public repo

Source: <https://www.coderabbit.ai/pricing>

For the specific need here—**AI review on PRs in GitHub**—the pricing page strongly implies the free tier is not the long-term answer for private-repo PR review, because its listed free GitHub-facing feature is PR summarization, while the review product is sold in paid tiers/trial. <https://www.coderabbit.ai/pricing>

**Machine-readable PR surface:** CodeRabbit’s docs describe automatic PR reviews, review commands, review-thread resolution, and PR-description summary updates. That means findings land on standard GitHub PR surfaces: review comments/threads and PR description text, which are machine-readable through GitHub APIs. <https://docs.coderabbit.ai/guides/commands> <https://docs.coderabbit.ai/platforms/github-com> <https://docs.github.com/en/rest/pulls/comments>

**Integration cost:** low. Install GitHub app, authorize repo access, optionally add `.coderabbit.yaml`. CodeRabbit requests read-only access to actions/checks/metadata and read-write access to code, commit statuses, issues, and pull requests. <https://docs.coderabbit.ai/platforms/github-com> <https://docs.coderabbit.ai/configure-coderabbit/>

**Why not recommended here:**

- It adds a recurring subscription for the private-repo PR-review path. <https://www.coderabbit.ai/pricing>
- It moves review into an external SaaS, while map #18 says to keep agent execution in the home lab and avoid cloud compute for agent execution where possible.
- Its machine-readable shape is GitHub-native, but **not your schema**; you would still need translation if you want ledger/source/category parity.

### 2) GitHub Copilot code review is the cleanest native PR review surface, but not the best fit for the stated constraints

Official Copilot docs say:

- you request Copilot as a PR reviewer in GitHub,
- it usually responds in under 30 seconds,
- it leaves comments on the PR,
- its comments behave like human review comments,
- it **always** leaves a `Comment` review, never `Approve` or `Request changes`, so it does **not** count toward required approvals and will **not** block merges,
- review can also be requested via REST by requesting `copilot-pull-request-reviewer[bot]` as reviewer,
- and Copilot code review uses **GitHub Actions** to run agentic capabilities. <https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review>

**Machine-readable PR surface:** excellent. Findings land as normal GitHub review comments, so they are readable via the pull-request review comments API. <https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review> <https://docs.github.com/en/rest/pulls/comments>

**Pricing snapshot from official GitHub pricing page:**

- **Free**: code review **not included**
- **Pro**: `$10/user/month`
- **Pro+**: `$39/user/month`
- **Max**: `$100/user/month`

Source: <https://github.com/features/copilot/plans>

**Integration cost:** low to medium. If you already pay for Copilot Pro+, enabling PR review is straightforward; if not, it is a new monthly subscription plus repository/org setup.

**Why not recommended as primary here:**

- It is still incremental subscription cost for a capability the repo largely already has locally. <https://github.com/features/copilot/plans>
- Its reviews are advisory only; they do not block merges by themselves. <https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review>
- Its agentic review path uses GitHub Actions runners, which is a weaker fit for the map’s home-lab/no-cloud-agent-execution preference. <https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review>

### 3) Running the existing gate as a PR check is the best machine-readable foundation

GitHub provides three first-party machine-readable surfaces relevant here:

1. **Pull-request review comments** via the PR review comments API. <https://docs.github.com/en/rest/pulls/comments>
2. **Check runs** with structured output and annotations. GitHub’s Checks API exposes `output.summary`, `output.text`, `annotations_count`, and `annotations_url`. <https://docs.github.com/en/rest/checks/runs>
3. **SARIF / code scanning** upload, which creates first-class code-scanning results on the commit/repo. <https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github>

For this repo’s existing `aiGate` contract, the most natural fit is:

- run the gate on a **self-hosted runner** in the home lab, since GitHub says self-hosted runners are free to use with Actions and can be on-premises; you own the machine/runtime cost. <https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners>
- have the gate emit a stable JSON result matching the repo’s existing concepts (`verdict`, `findings[]`, `location`, `severity`, `summary`, `category`, `whyMissed`, `disposition`)
- translate that JSON into:
  - a **check run** for pass/fail/required-status behavior,
  - **annotations** for line-level UI,
  - optionally **PR review comments** for discussion UX,
  - optionally **SARIF** if you want results to participate in GitHub’s code-scanning UI.

**Incremental cost:** minimal software cost if you stay on self-hosted infrastructure. This mostly costs implementation time.

**Integration cost:** medium. You must define the gate JSON contract, Action workflow, comment/check publisher, dedupe policy, and how PR findings map into the existing ledger.

### 4) Reviewer children plus aiGate already suffice if their output is posted back to the PR under one repo-owned schema

This is the key conclusion.

The repo already has:

- a fresh-reviewer-child pattern (`review-child`),
- a distinct gate concept (`ai-gate`),
- a review ledger with source-aware record taxonomy,
- duplicate suppression rules,
- and a closed finding-category vocabulary.

Those are the hard design parts. The missing part is just **delivery onto GitHub PR surfaces**.

A practical repo-owned contract would be:

- **Line comments:** one GitHub review comment per finding when the path/line is known.
- **Summary comment:** one top-level PR summary comment containing a fenced JSON block with the normalized finding list and overall verdict.
- **Required check:** one PR check named something like `ai-review/gate` that fails on `FIX`/`BLOCKER` according to the chosen merge policy.

That gives you:

- discussion-friendly UX for humans,
- machine-readable ingestion through GitHub APIs,
- no dependence on a vendor’s proprietary finding taxonomy,
- and direct compatibility with the existing ledger concepts.

### 5) The best split is: comments for review-child output, checks for aiGate output

I do **not** recommend forcing every surface into one mechanism.

Best split:

- **Fresh reviewer children**: publish as PR review comments plus one structured summary comment.
  - Rationale: reviewer-child output is judgment-heavy and conversational.
- **`aiGate`**: publish as a required check, with annotations and optional mirrored comments for actionable findings.
  - Rationale: gate output is already modeled as deterministic PASS/FIX/BLOCKER evidence.

This aligns with the current repo contracts better than either SaaS alternative.

## Recommended architecture for this repo

### Recommended now

1. **Keep AI review repo-owned.** Use reviewer children + `aiGate`; do not buy CodeRabbit just for this.
2. **Implement PR delivery in the bridge layer, not in the review logic.**
3. **Define one normalized finding schema** shared across:
   - reviewer-child output normalization,
   - `aiGate` output,
   - PR summary comment JSON,
   - PR check annotations,
   - future ledger extension work.
4. **Use a self-hosted GitHub Actions runner** for the PR-check path to stay aligned with the home-lab preference. <https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners>

### Recommended normalized schema

Minimum fields:

```json
{
  "source": "review-child | ai-gate",
  "verdict": "PASS | FIX | BLOCKER",
  "summary": "string",
  "findings": [
    {
      "path": "string",
      "line": 12,
      "severity": "minor | major | blocking | ...",
      "category": "spec-miss | correctness | test-gap | convention-violation | architecture | verification-skipped",
      "summary": "string",
      "whyMissed": "string",
      "disposition": "must-fix | should-fix | non-remediable-blocker"
    }
  ]
}
```

This is already close to `schema.ts` and `augmentations/auto.md`; it is not a greenfield design.

### Why this beats the alternatives

- **Versus CodeRabbit:** avoids recurring spend and vendor lock-in for a repo that already has a richer internal review taxonomy.
- **Versus Copilot code review:** avoids paying for a second reviewer layer when the repo already pays for high-end Codex reviewer children and wants home-lab execution.
- **Versus “gate only”:** preserves the broader judgment and exploratory review surface of fresh reviewer children.

## Cost summary

### Existing reviewer children + aiGate

- **Software subscription cost:** effectively incremental `$0` if kept within current flat-rate Codex usage/caps.
- **Infra cost:** self-hosted machine/runtime you already own.
- **Engineering cost:** moderate; this is where the real cost sits.

### CodeRabbit

- **Free:** `$0`, but not the right long-term private PR review fit here; free highlights PR summarization and IDE/CLI review, not durable private-repo PR reviewing on GitHub. <https://www.coderabbit.ai/pricing>
- **Pro:** `$24/user/month` billed annually. <https://www.coderabbit.ai/pricing>
- **Pro Plus:** `$48/user/month` billed annually. <https://www.coderabbit.ai/pricing>
- **Integration effort:** low.

### GitHub Copilot code review

- **Free:** no PR code review. <https://github.com/features/copilot/plans>
- **Pro:** `$10/user/month`. <https://github.com/features/copilot/plans>
- **Pro+:** `$39/user/month`. <https://github.com/features/copilot/plans>
- **Max:** `$100/user/month`. <https://github.com/features/copilot/plans>
- **Integration effort:** low to medium.

## Implications for later Wayfinder decisions

### 1) Ledger evolution should add PR-facing provenance, not replace current sources

Map #18 already flags future review-ledger schema extension for CI- and PR-sourced findings. The cleanest follow-on is to keep `source` semantics about **producer** (`review-child`, `ai-gate`) and add separate PR-delivery provenance later if needed, rather than replacing the current taxonomy. That preserves ADR 0003’s current logic. See:

- `docs/adr/0003-review-ledger.md`
- `extensions/matt-workflow-pi-extension/augmentations/auto.md`

### 2) Trigger wiring should treat comment-posting and gate execution as separate bridge concerns

The bridge likely needs two independent jobs:

- **review publication job**: normalize and post reviewer-child output to PR comments
- **gate check job**: run `aiGate`, publish check/annotations, optionally mirror findings into comments

That separation will make later trigger research and gateway-MCP decisions easier.

### 3) Risk-gate policy should key off the normalized check, not vendor review status

If later work wants required checks or auto-merge expansion, tie that to the repo-owned `aiGate`/normalized-review check rather than CodeRabbit/Copilot-specific statuses. That keeps future policy portable.

## Bottom line

**Recommendation:** build the PR bridge around **your own reviewer children + `aiGate`**, not around CodeRabbit or Copilot.

- Use **review comments** for fresh reviewer-child findings.
- Use a **required self-hosted PR check** for `aiGate` findings.
- Add **one structured summary comment** so the full normalized result is machine-readable from the PR timeline.

For this repo and this home-lab workflow, that is the best balance of cost, control, machine-readability, and alignment with the existing Matt workflow contracts.

## Gaps / uncertainties

1. I did not find a repo-local `.pi/matt-conventions.json`, so the current repo has no configured `aiGate` command yet; the recommendation assumes you will later define one.
2. GitHub/Copilot and CodeRabbit pricing are date-sensitive; numbers above are a snapshot from the official pages fetched during this investigation.
3. CodeRabbit’s pricing page is unusually marketing-heavy; the strongest grounded conclusion is that free is centered on PR summarization plus IDE/CLI review, while full private PR review capability is part of the paid/trial product surface.
4. This investigation did not inspect any existing PR-comment-posting automation in the home lab, so actual bridge effort could shift depending on what already exists in the gateway/headless tooling.
