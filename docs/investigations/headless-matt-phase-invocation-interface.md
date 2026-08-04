# Research: headless Matt phase invocation Interface

## Decision

Use **Pi RPC mode (`pi --mode rpc`)** as the home-lab launcher's non-interactive Interface for one bounded Matt phase invocation.

RPC is the smallest supported surface that provides all required properties together:

- process isolation for the dedicated automation account;
- strict JSONL request/response framing;
- extension-command invocation through the normal prompt path;
- structured lifecycle and error events; and
- `agent_settled`, the completion barrier after retries, compaction retries, and queued continuations are exhausted.

Sources: [`docs/rpc.md:1-76`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md), [`docs/extensions.md:327-347`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md), [`dist/core/agent-session.js:298-320`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js).

This is a launcher decision, not destination implementation. It does not define Matt queue behavior, cross-session rollover, or a new extension-owned execution engine.

## Candidate comparison

| Candidate | Evidence | Decision |
|---|---|---|
| Print/JSON one-shot CLI | Ordinary prompts are awaited by the one-shot runner, but the live validation in [Validate headless Pi on the home lab](https://github.com/GregM1991/gm-pi-environment/issues/29) showed that both `/matt-status` forms returned after extension dispatch without `agent_start`. The command handler's injected user message was not driven to settlement. | Reject for Matt extension commands. |
| RPC subprocess | First-party headless protocol with prompt responses, streamed events, `abort`, state queries, strict JSONL framing, and `agent_settled`. | **Choose.** |
| Direct SDK | `AgentSession.prompt()` has strong settlement semantics, and `AgentSessionRuntime` owns session replacement. It would couple the host launcher to Pi's in-process construction, resource loading, extension rebinding, and runtime lifecycle. | Supported fallback if later same-process integration is justified; unnecessary for v1. |
| Extension-owned headless entrypoint | Could manufacture a dedicated result protocol, but would duplicate or wrap an already supported RPC transport and risk splitting phase prompt ownership. | Do not create one for v1. |

Sources: [`docs/rpc.md:1-130`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md), [`docs/sdk.md:76-148`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md), [`docs/sdk.md` AgentSessionRuntime section](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md), [`dist/modes/print-mode.js:40-107`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/modes/print-mode.js).

## Why RPC preserves the existing Matt contract

The Matt extension remains the only owner of phase prompt construction. `/matt-afk <target>` is registered in `index.ts`; for a targeted run it waits for idle, creates a fresh child session, and sends the generated AFK prompt through the replacement-session context. The launcher sends the command string only. It does not build, copy, or interpret the phase prompt.

Sources: [`extensions/matt-workflow-pi-extension/index.ts:715-757`](../../extensions/matt-workflow-pi-extension/index.ts), [`extensions/matt-workflow-pi-extension/README.md:10-18`](../../extensions/matt-workflow-pi-extension/README.md), [`docs/extensions.md` command and replacement-session sections](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md).

In deep-module terms, RPC is the real **Seam**. Pi's RPC process is the **Module**; JSONL commands and lifecycle events are its **Interface**; resource discovery, extension dispatch, session replacement, provider calls, and retries remain hidden **Implementation**. A second extension-owned headless Interface would add little **Leverage** and reduce **Locality** by spreading launch semantics across two owners.

## Bounded launcher contract

### Process boundary

Run as the validated dedicated account from the isolated pilot worktree, with the dedicated Pi directory and model policy explicit:

```bash
PI_CODING_AGENT_DIR=/var/lib/pi-automation/.pi/agent \
  "$PI_BIN" \
  --mode rpc \
  --no-session \
  --provider openai-codex \
  --model gpt-5.6-sol \
  --thinking high \
  --name "matt-afk-<pilot-issue>"
```

Production uses high thinking under the map's usage-cap safeguards. The low-thinking invocation below was a transport probe only and does not define launcher policy.

`PI_BIN` is the absolute Pi executable path captured and verified when the dedicated account is provisioned; trigger policy must not depend on an interactive shell's `PATH`. The Pi Environment remains installed from `git:github.com/GregM1991/gm-pi-environment` under that `PI_CODING_AGENT_DIR`; the launcher must not point at an editing checkout or package-cache implementation path. The process `cwd` is the isolated worktree. The dedicated-account, credential, trust, runtime, and package locations were validated in [Validate headless Pi on the home lab](https://github.com/GregM1991/gm-pi-environment/issues/29); [Headless trigger wiring and launch policy](https://github.com/GregM1991/gm-pi-environment/issues/30) owns the concrete service `ExecStart` path.

RPC and CLI option sources: [`docs/rpc.md:8-16`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md), [`extensions/matt-workflow-pi-extension/README.md`](../../extensions/matt-workflow-pi-extension/README.md).

### Protocol

1. Start the process under an outer wall-clock deadline.
2. Send `get_commands` and require one available extension command named `matt-afk`. Treat absence or unexpected provenance as package/configuration failure before work begins.
3. Send exactly one LF-delimited prompt command:

   ```json
   {"id":"phase-1","type":"prompt","message":"/matt-afk <pilot-issue>"}
   ```

4. Require the matching prompt response with `success:true`. This proves acceptance only.
5. Require at least one `agent_start`, then wait for `agent_settled`.
6. After settlement, query `get_last_assistant_text` and `get_state` for the completion report and final idle/session evidence.
7. Close stdin and require a clean process exit. Preserve stdout JSONL and stderr as private structured logs.

RPC records are delimited by LF (`\n`) only. A client may strip a trailing `\r`, but must not use a generic reader that treats Unicode line separators as records. Prompt `success:true` means accepted, queued, or handled; failures after acceptance appear in events/messages. Sources: [`docs/rpc.md:24-31`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md), [`docs/rpc.md:41-76`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md), [`docs/rpc.md` state commands and events](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md).

### Invocation result

Classify the **Pi invocation** as completed successfully only when all are true:

- `matt-afk` was present in `get_commands`;
- the correlated prompt response was `success:true`;
- `agent_start` occurred;
- `agent_settled` occurred before the outer deadline;
- no fatal `extension_error` or assistant `stopReason:"error"`/`"aborted"` occurred;
- `get_last_assistant_text` returned a non-empty completion report; and
- the RPC process exited zero after stdin closed.

A settled Matt report may still say that workflow work is blocked, needs human judgment, or stopped safely. That is a **completed invocation with a non-success workflow outcome**, not transport failure. Until Matt exposes a structured outcome record, the launcher must preserve the report for the human/notification layer and must not grant automated authority by parsing optimistic prose.

Failure classes:

- **configuration:** expected command missing or wrong package/resource discovery;
- **rejected:** correlated prompt response has `success:false`;
- **runtime:** fatal extension error, assistant error/abort, malformed JSONL, or unexpected process exit;
- **timeout:** no settlement before the outer deadline;
- **workflow stop:** invocation settled cleanly but Matt reports blocked/human-required work.

On timeout, send RPC `abort`, allow a bounded grace period, close stdin or send `SIGTERM`, then use `SIGKILL` only after a final short grace period. Source: [`docs/rpc.md:122-130`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md).

### Extension UI policy

RPC reports UI calls through `extension_ui_request`. Treat fire-and-forget `notify`, status, widget, title, and editor-text events as logs. A blocking `select`, `confirm`, `input`, or `editor` request requires a matching response; for the unattended pilot, treat any such request as `workflow stop: human required`, abort cleanly, and do not synthesize a user answer.

Source: [`docs/rpc.md` Extension UI Protocol](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md).

## Local non-mutating RPC probe

A local probe on 2026-08-03 exercised the chosen Interface with the installed Pi package and `/matt-status`:

```text
pi --mode rpc --no-session --provider openai-codex \
  --model gpt-5.6-sol --thinking low
```

The client sent `/matt-status`, used strict LF JSONL framing, and observed:

- correlated prompt response: accepted;
- `agent_start`: present;
- `agent_end` with `willRetry:false`: present;
- `agent_settled`: present;
- `get_last_assistant_text`: non-empty;
- `get_state`: successful;
- extension/assistant errors: none; and
- process exit after stdin close: `0`.

This closes the gap found by the JSON/print validation without executing destination work. The probe was non-mutating; its temporary logs stayed under `/tmp` and are not durable project artifacts.

## Deferred isolated-worktree AFK pilot

Do not use this Wayfinder ticket as the AFK target. Select one bounded, unblocked `ready-for-agent` implementation issue whose acceptance criteria permit unattended work.

The rerun contract is:

1. Resolve the canonical repository identity and acquire one non-blocking external lock for it **before** creating/entering the worktree or starting Pi.
2. While the first launcher holds the lock, start a second test contender and verify it fails immediately without spawning Pi or touching the worktree.
3. Create an isolated worktree for the pilot issue and run the RPC process there as `pi-automation`.
4. Preflight `get_commands`, then send one `/matt-afk <pilot-issue>` prompt.
5. Keep the lock through `agent_settled`, final state/report queries, process shutdown, and launcher log finalization.
6. Record the lock identity, first-owner PID/run id, contender rejection, worktree path, prompt id, settlement result, process exit, and resulting issue/commit state. Never record credentials.
7. Release the lock and verify a new contender can then acquire it.

This ticket chooses the Pi Interface and pilot observation contract. Exact lock storage, stale-owner recovery, systemd/webhook wiring, and launch policy belong to [Headless trigger wiring and launch policy](https://github.com/GregM1991/gm-pi-environment/issues/30).

## Collision boundaries

- [Headless Matt phase invocation Interface](https://github.com/GregM1991/gm-pi-environment/issues/34): one bounded subprocess invocation and its settlement contract.
- [Headless trigger wiring and launch policy](https://github.com/GregM1991/gm-pi-environment/issues/30): external queue/lock, systemd launch, trigger authorization, stale-run recovery, and pilot execution policy.
- [matt-auto phase 1: boundary-safe orchestrator handoff and manual resume](https://github.com/GregM1991/gm-pi-environment/issues/16): checkpoint manifest and user-confirmed cross-session continuation.
- [matt-auto phase 2: unattended orchestrator rollover across sessions](https://github.com/GregM1991/gm-pi-environment/issues/17): successor lease and automatic continuation, building on phase one.

RPC does not replace the ownership or recovery contracts in those tickets.

## Residual risks

1. Pi exposes an exact transport/settlement result, but Matt does not yet expose a structured semantic outcome. v1 must preserve the final report without turning prose parsing into execution authority.
2. External locking and isolated worktrees are host policy, not Pi-native guarantees.
3. A blocking RPC UI request is a legitimate unattended stop, not a launcher defect.

## Primary sources

- [`@earendil-works/pi-coding-agent/docs/rpc.md`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md)
- [`@earendil-works/pi-coding-agent/docs/sdk.md`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md)
- [`@earendil-works/pi-coding-agent/docs/extensions.md`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md)
- [`@earendil-works/pi-coding-agent/dist/core/agent-session.js`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js)
- [`@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-mode.js`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-mode.js)
- [`@earendil-works/pi-coding-agent/dist/modes/print-mode.js`](file:///home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/modes/print-mode.js)
- [`extensions/matt-workflow-pi-extension/index.ts`](../../extensions/matt-workflow-pi-extension/index.ts)
- [`extensions/matt-workflow-pi-extension/README.md`](../../extensions/matt-workflow-pi-extension/README.md)
- [Validate headless Pi on the home lab](https://github.com/GregM1991/gm-pi-environment/issues/29)
- [matt-auto phase 1: boundary-safe orchestrator handoff and manual resume](https://github.com/GregM1991/gm-pi-environment/issues/16)
- [matt-auto phase 2: unattended orchestrator rollover across sessions](https://github.com/GregM1991/gm-pi-environment/issues/17)
