# Research: Headless Pi triggers on the home lab

## Summary
Headless Pi runs on the home lab look feasible, including Matt workflow slash commands, because Pi supports non-interactive print/JSON/RPC modes, persists auth in `~/.pi/agent/auth.json`, and the Matt extension is designed as slash commands that send prompt contracts rather than requiring a TUI. The important caveat is that this investigation did **not** perform a live run: `pi -p "/matt-afk #N"` and `/matt-auto` on the server are therefore **supported by docs and local source review, but only fully confirmed after a safe probe** using the real server auth/trust state.

Recommended path: use a **systemd-managed launcher** on the home lab, optionally triggered by a tiny authenticated webhook receiver, with **one ephemeral git worktree per run** and optionally a **container per run**. Keep the self-hosted GitHub Actions runner as a second-choice launcher when GitHub-native dispatch/logs are worth the added control-plane coupling. The main missing capability is still **safe unattended orchestrator rollover across Pi sessions**, which is exactly what issues [#16](https://github.com/GregM1991/gm-pi-environment/issues/16) and [#17](https://github.com/GregM1991/gm-pi-environment/issues/17) are about.

## Findings
1. **Pi supports true non-interactive execution modes, and Matt commands are implemented as extension slash commands rather than TUI-only controls.** Pi documents `-p/--print`, `--mode json`, and `--mode rpc` as headless modes; non-interactive modes do not show a trust prompt; RPC and SDK both support extension commands and session replacement APIs. The Matt extension README also uses `pi ... -p /matt-profile` as a verification example, which is strong local evidence that Matt slash commands are intended to work in print mode. Severity: medium, because this is the foundation for headless launching. Sources: `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/README.md`; `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md`; `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`; `extensions/matt-workflow-pi-extension/README.md`; `extensions/matt-workflow-pi-extension/index.ts`.

2. **`/matt-afk` and `/matt-auto` are designed for AFK/headless work, but they assume a single parent orchestrator with exclusive ownership of repo state.** The extension README defines `/matt-afk <issue|label>` as a fresh-context AFK loop, `/matt-afk` with no argument as shorthand for the continuous auto-loop, and `/matt-auto` as the parent orchestrator that continuously implements, reviews, commits, and closes ready issues. The auto prompt explicitly assumes one parent orchestrator, serial work, fresh worker/reviewer children, repo-local verification logs, and loop-owned closeout. That means unattended launch is plausible, but **concurrency control must be supplied outside Pi** so two auto runs never share a checkout or queue. Severity: high if ignored, because concurrent runs would violate the command’s own assumptions. Sources: `extensions/matt-workflow-pi-extension/README.md`; `extensions/matt-workflow-pi-extension/index.ts`; `extensions/matt-workflow-pi-extension/augmentations/auto.md`.

3. **OpenAI Codex subscription auth should persist for headless reuse, but that is still an inference until probed on the server.** Pi’s provider docs say ChatGPT Plus/Pro (Codex) subscription auth is supported via `/login`; tokens are stored in `~/.pi/agent/auth.json`; OAuth tokens auto-refresh when expired; auth file entries take precedence over environment variables. That supports a headless server flow where a human performs one interactive login under the automation account and later non-interactive runs reuse that auth. What is **not** verified here is whether the specific home-lab server already has valid Codex subscription auth for the intended account, whether refresh succeeds without a browser on that machine, and whether quota/cap behavior is acceptable for unattended loops. Severity: high, because launcher design is moot without durable auth. Sources: `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/providers.md`; `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/README.md`.

4. **Headless runs also require pre-resolved project trust.** Pi states that non-interactive modes (`-p`, JSON, RPC) never show a trust prompt. With default trust behavior, project-local resources may be ignored unless trust is already saved, `defaultProjectTrust` is set appropriately, or the run passes `--approve`. For this repo, that matters because Matt workflow behavior can depend on repo-local `.pi` config and extension resources. Severity: high, because a run may silently miss expected repo-local behavior instead of failing loudly. Sources: `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/README.md`; `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/settings.md`.

5. **`pi -p "/matt-afk #N"` and `pi -p "/matt-auto"` are likely to work non-interactively, but that specific claim still needs a safe live probe.** Verified pieces: Pi supports print mode; extension commands exist; Matt commands send prompt contracts rather than opening custom TUI editors; the repo itself documents print-mode verification. Unverified piece: an actual server invocation with the installed extension set, trust state, auth state, and any subagent/web-access dependencies present. The lowest-risk probe is **not** `/matt-afk` or `/matt-auto`; it is a no-mutation command such as `/matt-status`, `/matt-route-skills #N`, or `/matt-profile`, run with the same launcher environment. Severity: medium. Sources: `extensions/matt-workflow-pi-extension/README.md`; `extensions/matt-workflow-pi-extension/index.ts`; `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/README.md`.

6. **For unattended launchers, systemd is the best base layer; cron is acceptable only for the simplest schedule-only case.** `systemd.timer` activates a matching service, keeps supervision in one place, and avoids the weak logging/retry model of cron. A systemd service also gives a natural place for `WorkingDirectory=`, a dedicated Unix user, a custom `PI_CODING_AGENT_DIR`, and repo-level locking. Cron can launch the same wrapper, but you must add your own locking, log routing, and failure handling. Severity: medium. Sources: https://www.man7.org/linux/man-pages/man5/systemd.timer.5.html

7. **A webhook receiver is the best event-driven home-lab trigger, but only if it queues work and verifies HMAC signatures.** GitHub’s webhook docs require validating `X-Hub-Signature-256` with a shared secret. The receiver should acknowledge quickly, deduplicate by delivery ID, and enqueue work rather than shelling out inline. This fits a small home-lab service that translates label-add/comment/dispatch events into a systemd job. Severity: high if skipped, because direct shell execution from a webhook is an unnecessary remote-code-execution footgun. Sources: https://docs.github.com/en/enterprise-server%403.16/webhooks-and-events/webhooks/securing-your-webhooks

8. **A self-hosted GitHub Actions runner is viable, but it shifts trigger/control logic into GitHub and is broader-trust than a local timer/webhook wrapper.** GitHub says self-hosted runners are your responsibility, are not automatically clean per job, and are recommended only for private repos. `workflow_dispatch` requires the workflow on the default branch and an Actions-write token to trigger by API; `repository_dispatch` requires a workflow listening on the default branch and typically a Contents-write token to fire the event. The runner does buy you GitHub-native logs, notifications, concurrency controls, and an ephemeral `GITHUB_TOKEN` inside the workflow, but the repo’s workflow files become part of the trusted automation control plane. Severity: medium. Sources: https://docs.github.com/en/actions/concepts/runners/self-hosted-runners; https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners; https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow?tool=cli; https://docs.github.com/en/rest/actions/workflows; https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10&apiversion=2022-11-28

9. **Best isolation is `git worktree` plus an optional container; each solves a different problem.** `git worktree add --detach <path> <commit>` gives each run its own `HEAD` and index while sharing the object store; that is the lightest safe answer for one-run-per-issue execution. A container can add process/filesystem/network isolation, but only if you avoid broad writable mounts, avoid mounting the Docker socket, and keep the root filesystem/read-write mounts narrow. If you bind-mount the entire repo, home directory, and Docker socket, containerization does little for blast radius. Severity: high, because isolation is the main compensating control around unattended local auth. Sources: https://git-scm.com/docs/git-worktree; https://docs.docker.com/reference/cli/docker/container/run/

10. **Credential blast radius should be reduced with a dedicated automation user, dedicated Pi agent dir, and scoped GitHub tokens.** Pi auth is per-agent-dir (`PI_CODING_AGENT_DIR`) and `auth.json` is user-local. That makes a dedicated Unix account plus a dedicated Pi config/auth directory the cleanest separation between interactive Greg sessions and unattended automation. For GitHub-triggering and repo mutation, use the narrowest token possible: fine-grained PATs or, preferably, a GitHub App installation token when practical. `workflow_dispatch` needs Actions write; `repository_dispatch` needs Contents write; fine-grained PAT docs emphasize per-endpoint permission scoping. Severity: high. Sources: `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/environment-variables.md`; `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/providers.md`; https://docs.github.com/en/rest/actions/workflows; https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10&apiversion=2022-11-28; https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens

11. **Pi already exposes enough machine-readable output for unattended wrappers, but not enough built-in orchestration plumbing to replace a launcher.** Print mode gives final text; JSON mode streams structured events; RPC mode and the SDK expose richer state, queueing, and session replacement APIs. What Pi does **not** provide is a scheduler, a webhook server, a queue, a repo lock, or a built-in “run this slash command as a daemon job” facility. Severity: low by itself, but it defines the wrapper work you still need. Sources: `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/json.md`; `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md`; `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`.

12. **The biggest missing Pi/Matt capability for fully unattended long runs is safe session rollover, exactly as described by issues #16 and #17.** Issue #16 specifies a manual, boundary-safe checkpoint/resume flow when the parent `/matt-auto` orchestrator session grows too large. Issue #17 extends that to unattended successor creation with leases, acknowledgement, and recovery. Until those exist, a launcher can start `/matt-auto`, but it cannot safely continue a long logical auto run across multiple Pi parent sessions without human intervention. That means headless launching and unattended rollover are separate maturity levels: launch is mostly solved, rollover is not. Severity: high. Sources: `docs/investigations/auto-loop-orchestrator-model-selection.md`; issue [#16](https://github.com/GregM1991/gm-pi-environment/issues/16); issue [#17](https://github.com/GregM1991/gm-pi-environment/issues/17); issue [#18](https://github.com/GregM1991/gm-pi-environment/issues/18); issue [#24](https://github.com/GregM1991/gm-pi-environment/issues/24).

## Recommendation
Use this staged architecture:

1. **Primary launcher:** a **systemd service** wrapper under a dedicated automation Unix user.
2. **Primary trigger:**
   - **systemd timer** for scheduled polling/nightly work, or
   - a **tiny webhook receiver** that validates HMAC and enqueues a systemd job for event-driven launches.
3. **Execution isolation:** one **ephemeral git worktree per run**; add a **container per run** only if you want stronger isolation than same-user worktrees provide.
4. **Pi mode:** prefer `--mode json` for unattended observability; use `-p` only if you truly need final-text-only behavior.
5. **Credentials:** one dedicated `PI_CODING_AGENT_DIR`, one dedicated `auth.json`, and narrow GitHub credentials per trigger path.
6. **Concurrency:** one active run per repo/branch/queue target, enforced outside Pi.

### Why not make the self-hosted Actions runner the default?
It is viable, and it is the best choice if GitHub-native dispatch, logs, notifications, and concurrency groups are the highest priority. But for this repo’s “home lab only, self-owned rails” direction, it is a **fatter control plane** than necessary: workflow files on the default branch become trusted automation entrypoints, and the runner is still not automatically clean per job. A local systemd/webhook wrapper keeps the trigger/control path smaller.

## Launcher comparison

| Launcher | Best use | Pros | Cons | Verdict |
| --- | --- | --- | --- | --- |
| **cron** | simple scheduled polling | trivial to deploy | weak supervision, weak logs, external locking required | acceptable only as the first throwaway prototype |
| **systemd timer + service** | scheduled local runs | strong supervision, journald logs, dedicated user/env, easy locking | not event-driven by itself | **best base primitive** |
| **webhook receiver + systemd job** | label/comment/dispatch-driven runs | low latency, still local, smallest custom control plane | you must build HMAC validation, queueing, dedupe, and locking | **best event-driven option** |
| **self-hosted GitHub Actions runner** | GitHub-native dispatch/logs/notifications | built-in workflow UX, concurrency, job logs, `GITHUB_TOKEN` | broader trust surface; workflows on default branch are control plane; runner not automatically clean | good second choice |

## Isolation and credential posture

### Minimum acceptable
- Dedicated Unix user for automation.
- Dedicated `PI_CODING_AGENT_DIR` and session directory.
- One ephemeral `git worktree` per run.
- External lock per repo/branch/queue.
- Fine-grained GitHub token or GitHub App token.

### Better
- All of the above, plus a per-run container with:
  - read-only root filesystem,
  - narrow writable mounts,
  - no Docker socket mount,
  - no shared interactive home directory,
  - only the worktree and minimal Pi auth/config injected.

### Blast-radius notes
- **Codex subscription auth** is effectively user-scoped Pi auth in `auth.json`, not a distinct service account primitive.
- **Git worktree** isolates checkout state, **not** credentials or process privilege.
- **Container** isolates only as much as its mounts, namespaces, and caps allow.
- **GitHub Actions runner** can reduce GitHub API secret lifetime with `GITHUB_TOKEN`, but does not reduce the local host blast radius if the runner account has broad filesystem access.

## Process locking, logs, and notifications
- **Locking:** Pi/Matt does not provide repo-level mutual exclusion. Use `flock`, one-shot systemd services, a queue worker, or GitHub Actions concurrency groups.
- **Logs:**
  - Pi sessions persist under `~/.pi/agent/sessions/` unless `--no-session` is used.
  - `--mode json` gives structured event logs.
  - Matt auto already writes repo-local verification logs and review ledger entries.
  - systemd gives journald logs; Actions gives workflow logs; webhook receivers need explicit logging.
- **Notifications:**
  - Actions has built-in GitHub UX.
  - systemd/webhook setups need explicit notification wiring if desired.

## Missing capabilities for unattended runs
1. **No built-in launcher plane:** Pi does not ship a scheduler, webhook server, queue, or repo lock.
2. **No preflight “headless auth and trust health check” command:** you must probe with a safe command using the real runtime environment.
3. **No completed orchestrator rollover yet:** issue [#16](https://github.com/GregM1991/gm-pi-environment/issues/16) is the needed manual handoff; issue [#17](https://github.com/GregM1991/gm-pi-environment/issues/17) is the unattended follow-on.
4. **No service-account abstraction for Codex subscription auth:** the durable auth unit is still the local Pi auth store for a user/agent-dir.
5. **No native concurrency guard for `/matt-auto`:** wrapper-level locking remains mandatory.

## Implications for issues 16 and 17
- **Issue 16 is a prerequisite for robust long headless auto runs.** Without manual boundary-safe rollover, a launcher can start unattended work, but a long parent orchestrator session still has no trustworthy fresh-session handoff.
- **Issue 17 is the prerequisite for fully unattended multi-session auto runs.** Until it lands, any long `/matt-auto` run that reaches the orchestrator smart-zone ceiling still requires human intervention to resume.
- **Therefore:** “headless launch” can ship before “unattended end-to-end auto loop,” but only as a bounded first phase.

## Staged validation plan
1. **Bootstrap auth and trust under the automation user.** Perform one interactive Pi login on the home-lab server for OpenAI Codex subscription auth; save project trust intentionally.
2. **Safe non-mutating probe.** Run the real launcher with `/matt-profile`, `/matt-status`, or `/matt-route-skills #N` instead of `/matt-afk` or `/matt-auto`.
3. **Single-run AFK pilot.** Launch exactly one issue with `/matt-afk #N` in a disposable or low-risk repo worktree; verify logs, ledger writes, and cleanup behavior.
4. **Introduce external locking.** Enforce one active run per repo/branch/queue target before any event-driven trigger is enabled.
5. **Add event-driven trigger.** Prefer webhook receiver → queue → systemd job; only use the self-hosted runner if GitHub-native workflow UX is worth the extra coupling.
6. **Defer long unattended `/matt-auto` to post-#16.** Treat multi-session unattended continuation as blocked on #16, and fully automatic rollover as blocked on #17.

## Sources
- **Kept:** `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/README.md` — primary Pi CLI/headless/auth/session reference.
- **Kept:** `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/settings.md` — non-interactive trust behavior.
- **Kept:** `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/providers.md` — Codex subscription auth persistence and auth store semantics.
- **Kept:** `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/environment-variables.md` — `PI_CODING_AGENT_DIR` and session-env implications.
- **Kept:** `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/json.md` — structured unattended logging surface.
- **Kept:** `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md` — headless command/session protocol.
- **Kept:** `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md` — runtime/session replacement capabilities and limits.
- **Kept:** `extensions/matt-workflow-pi-extension/README.md` — local Matt command semantics, including AFK/auto behavior.
- **Kept:** `extensions/matt-workflow-pi-extension/index.ts` — actual prompt contracts and auto-loop assumptions.
- **Kept:** `extensions/matt-workflow-pi-extension/augmentations/auto.md` — verification/log/ledger side effects relevant to unattended execution.
- **Kept:** `docs/adr/0003-review-ledger.md` — durable evidence behavior for auto runs.
- **Kept:** `docs/investigations/auto-loop-orchestrator-model-selection.md` — parent-session model semantics and current capability gaps.
- **Kept:** issue [#16](https://github.com/GregM1991/gm-pi-environment/issues/16) — manual rollover prerequisite.
- **Kept:** issue [#17](https://github.com/GregM1991/gm-pi-environment/issues/17) — unattended rollover prerequisite.
- **Kept:** issue [#18](https://github.com/GregM1991/gm-pi-environment/issues/18) — map notes and home-lab constraints.
- **Kept:** issue [#24](https://github.com/GregM1991/gm-pi-environment/issues/24) — research question.
- **Kept:** https://docs.github.com/en/actions/concepts/runners/self-hosted-runners — runner trust model and persistence.
- **Kept:** https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners — runner setup and security warning.
- **Kept:** https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow?tool=cli — `workflow_dispatch` behavior.
- **Kept:** https://docs.github.com/en/rest/actions/workflows — dispatch API permissions and inputs.
- **Kept:** https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10&apiversion=2022-11-28 — `repository_dispatch` permission requirement.
- **Kept:** https://docs.github.com/en/enterprise-server%403.16/webhooks-and-events/webhooks/securing-your-webhooks — webhook HMAC validation.
- **Kept:** https://git-scm.com/docs/git-worktree — worktree isolation semantics.
- **Kept:** https://docs.docker.com/reference/cli/docker/container/run/ — container isolation caveats.
- **Kept:** https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens — scoped token model.
- **Kept:** https://www.man7.org/linux/man-pages/man5/systemd.timer.5.html — timer/service behavior.
- **Dropped:** generic SEO articles about cron vs webhook vs Actions — replaced by primary docs.
- **Dropped:** public issue search noise for unrelated repos — not authoritative for this repo’s private/local constraints.

## Gaps
- No live probe was run, so actual server behavior for existing Codex subscription auth, project trust, and installed extension loading remains unconfirmed.
- I could not inspect the live `pi --help` output directly with the available tools; conclusions rely on the installed README/docs and local extension sources instead.
- Quota/cap behavior for long unattended Codex subscription usage remains a real operational unknown and should be measured in the pilot.
