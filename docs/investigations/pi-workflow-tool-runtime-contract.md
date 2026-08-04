# Official Pi runtime constraints for workflow tools

**Research ticket:** [#36](https://github.com/GregM1991/gm-pi-environment/issues/36), under map [#35](https://github.com/GregM1991/gm-pi-environment/issues/35)

**Scope:** first-party Pi extension/tool-runtime behavior relevant to a reusable workflow-operations suite. This is runtime research, not a destination design or implementation.

## Executive conclusion

Pi provides a sound v1 substrate for bounded workflow operations if the companion extension treats each operation as a separately registered, schema-validated tool; throws on execution failure; propagates the supplied abort signal; explicitly truncates large results; and keeps a headless-safe result contract independent of TUI rendering. Availability is inspectable at runtime, tools can be activated dynamically, and extension tools run in TUI, RPC, JSON, and print modes.

The important boundary is that Pi supplies **mechanisms**, not the workflow suite's domain contract. Pi does not make a broad TypeBox object closed merely because it is called “strict,” does not automatically make arbitrary external work cancellable, does not automatically truncate custom-tool output, and does not prevent another extension from overriding a same-named tool. Those invariants remain the suite's responsibility.

## Guarantees and v1 constraints

### 1. Tool schema and invocation

**Guaranteed by the documented runtime**

- `pi.registerTool()` accepts a TypeBox `parameters` schema; Pi runs optional `prepareArguments(args)` **before schema validation** and before `execute()`. This supports old persisted calls without polluting the current public schema.[1]
- The validated parameters, an `AbortSignal`, an optional progress callback, and `ExtensionContext` are passed to `execute(toolCallId, params, signal, onUpdate, ctx)`.[1]
- For provider compatibility, official guidance requires `StringEnum` from `@earendil-works/pi-ai` for string enums; `Type.Union`/`Type.Literal` is specifically documented as incompatible with Google's API.[1]
- A tool result consists of model-visible `content` plus optional extension/UI state in `details`; nested model usage may be returned as `usage` and contributes to session totals.[1][4]

**Constraint for the workflow suite**

- Define one TypeBox object per semantic operation, with required/optional fields and bounds encoded in the schema. If “strict” means rejecting unknown keys, encode that explicitly (for example, `additionalProperties: false`) and test it. The Pi docs promise schema validation, but do **not** promise that every `Type.Object(...)` is closed to unknown properties.[1]
- Keep compatibility shims in `prepareArguments`; do not add legacy alternatives or a generic `action` catch-all to the public operation schema.[1]
- Do not rely on a provider accepting arbitrary JSON-Schema constructs. The documented Google enum exception proves schema portability is not automatic.[1]
- A `tool_call` extension hook may mutate arguments after the normal validation point, and Pi explicitly performs **no re-validation** after that mutation. Later hooks observe earlier mutations.[1] Therefore operation implementations must still defend mutation-critical invariants at the domain boundary, especially before side effects.

### 2. Error signaling and typed outcomes

**Guaranteed by the documented runtime**

- The only documented way for `execute()` to mark a tool result as failed is to **throw**. Pi catches the error, reports it to the model with `isError: true`, and continues the agent loop. Returning an object never sets the error flag, regardless of fields placed on that object.[1]
- `tool_result` middleware may patch `content`, `details`, `isError`, or `usage`, in extension load order. Each handler sees the preceding handler's result.[1]
- Tool lifecycle events expose start, update, and end; end includes the finalized result and `isError`. In parallel execution, updates/end events can interleave in completion order, while final tool-result messages are emitted later in assistant source order.[1][4]
- RPC command errors use a separate envelope: `{type:"response", command, success:false, error}`. A successful `prompt` response means accepted/queued/handled, not that the later agent run succeeded; later failures arrive in events/messages.[4]

**Constraint for the workflow suite**

- Separate two channels deliberately:
  1. **Expected domain outcomes** (for example, already satisfied, precondition conflict, not found) should be a stable structured result rendered in `content`/`details` according to the operation contract.
  2. **Execution/runtime failure** (transport failure, invalid adapter response, invariant violation) should throw so Pi emits `isError: true`.
- Never encode an execution failure only as `{details: {error: ...}}`; Pi will treat that as a successful tool call.[1]
- Because later extensions can rewrite `isError` or content, durable side-effect evidence must live in the operation result/domain record, not be inferred only from presentation events.

### 3. Cancellation

**Guaranteed by the documented runtime**

- Every tool `execute()` receives a cancellation signal. Official examples check `signal.aborted` and pass `signal` to `pi.exec`; event handlers can use `ctx.signal` for abort-aware nested `fetch` or model work during an active turn.[1]
- RPC exposes `abort` for the current agent operation and a distinct `abort_bash` for a direct RPC bash command.[4]
- TUI dialog APIs accept an `AbortSignal`; `BorderedLoader` exposes its own signal for cancellable asynchronous UI work.[1][5]

**Constraint for the workflow suite**

- Cancellation is cooperative. Pass the supplied signal through every Adapter/network/process layer and check it before each irreversible side effect. Pi cannot cancel an API or library that ignores the signal.
- Do not equate “abort requested” with “no mutation occurred.” A remote mutation may have completed before cancellation was observed. Return/recover explicit side-effect evidence and support idempotent reconciliation.
- Avoid mandatory confirmation dialogs inside operation tools: JSON and print have no UI, and RPC requires a client that implements the extension UI sub-protocol.[1][4] Phase orchestration should own HITL authorization, as map #35 already states.

### 4. Output truncation

**Guaranteed/documented behavior**

- Pi's official extension contract says custom tools **must truncate** output. It exports `truncateHead`, `truncateTail`, `truncateLine`, `DEFAULT_MAX_BYTES` (50 KB), and `DEFAULT_MAX_LINES` (2,000). The docs require telling the model that truncation occurred and where full output was saved.[1]
- The direct RPC `bash` command reports `truncated`, may return `fullOutputPath`, and still streams all chunks as `bash_execution_update` events even when the final response is truncated.[4]

**Constraint for the workflow suite**

- Truncation of custom operation results is not described as automatic. Apply an explicit deterministic bound before returning `content`; preserve machine-meaningful summary fields and counts in `details`.
- A temp-file path is local, ephemeral evidence, not a portable result contract. For workflow operations prefer bounded records, pagination/cursors, and stable identifiers; use a full-output file only as diagnostic fallback.
- Document per-tool limits. Use head/tail choice according to semantics rather than silently dropping records.[1]

### 5. Dynamic activation, provenance, and availability

**Guaranteed by the documented runtime**

- `pi.registerTool()` works during extension load and after startup. Newly registered tools refresh immediately in the same session without `/reload`.[1]
- `pi.getActiveTools()` returns active names. `pi.getAllTools()` returns registered tool metadata including `name`, `description`, `parameters`, `promptGuidelines`, and canonical `sourceInfo` provenance. Documented sources include `builtin`, `sdk`, and extension source metadata.[1]
- `pi.setActiveTools(names)` enables/disables registered tools. Unknown names are ignored.[1]
- Dynamic loading works on every model: a purely additive activation is recorded on the loader result and applied before the next model request. Supported Anthropic/OpenAI models can use native deferred representations; all others receive the complete active tool list on the following request.[1]
- Removing/replacing tools works, but falls back to rebuilding the ordinary active list. Activating tools with `promptSnippet`/`promptGuidelines` rebuilds the system prompt and can invalidate prompt caching.[1]

**Constraint for the workflow suite**

- Treat “registered,” “active,” and “provenance matches the expected companion extension” as separate preflight checks. Because unknown activation names are silently ignored, call `getAllTools()` first and verify the postcondition with `getActiveTools()`.
- Dynamic activation is suitable as an optimization if the catalog becomes large; it must not be the only correctness gate. The workflow client should hard-stop when a required operation is absent/inactive rather than assume the model will discover it.
- Native deferred loading is a performance/cache capability, not a portable semantic dependency. V1 must work through the documented fallback.
- Prefer no `promptSnippet`/`promptGuidelines` on lazily loaded operation tools unless necessary; descriptions and schemas should carry their contract without invalidating the stable prompt prefix.[1]

### 6. Extension composition and tool identity

**Guaranteed by the documented runtime**

- Multiple tools may be registered by one extension and share extension state; session-scoped resources should start at `session_start` and be closed idempotently at `session_shutdown`.[1]
- Extensions may override a built-in tool by registering the same name. Interactive mode warns, but override is allowed. Execution and renderer inheritance are resolved independently; prompt metadata is not inherited.[1]
- Multiple same-named commands are retained and receive numeric invocation suffixes in load order. Tools do not have the equivalent documented suffix behavior.[1]
- Tool hooks compose in extension load order. `tool_call` mutations chain; `tool_result` patches chain; handler errors are generally logged, while a `tool_call` hook error blocks the call fail-safe.[1]
- `pi.events` is a shared inter-extension event bus.[1]

**Constraint for the workflow suite**

- Use a collision-resistant tool namespace and verify `sourceInfo`; a name alone is not authoritative availability/provenance because another extension can replace an implementation.
- Do not depend on extension load order for domain correctness. Hook ordering and result rewriting make load-order coupling fragile.
- Keep the standalone core Module free of Pi types, with the companion extension adapting schemas, cancellation, results, and rendering. This also keeps the Module testable without a live Pi session.
- If a custom tool mutates files, use Pi's exported `withFileMutationQueue()` across the complete read-modify-write window. Tool calls execute in parallel by default, and omitting the shared queue can lose writes when custom and built-in mutation tools touch the same file.[1]
- Parallel sibling calls are not transactions: preflight is sequential, execution is concurrent, and a `tool_call` hook cannot assume sibling results are already in session state.[1]

### 7. TUI, RPC, JSON, and print behavior

| Mode | Runtime guarantee | Workflow-suite implication |
|---|---|---|
| TUI | `ctx.mode === "tui"`, `ctx.hasUI === true`; full dialogs, custom components, and renderers are available.[1][5] | Rendering may be rich, but must remain presentation-only. A renderer failure falls back to tool name/raw text.[1] |
| RPC | `ctx.mode === "rpc"`, `ctx.hasUI === true`; dialogs/notifications use a JSON UI request/response protocol. `custom()` returns `undefined`; several direct-TUI methods are no-ops/defaults.[4] | A client must implement dialog responses if operations invoke them. Prefer non-interactive tools so RPC behavior is deterministic. Correlate tool events by `toolCallId`; do not equate prompt acceptance with completion. Wait for `agent_settled` when no automatic continuation may remain.[4] |
| JSON | `ctx.mode === "json"`, `ctx.hasUI === false`; Pi emits a session header followed by JSONL lifecycle/message/tool events; UI methods are no-ops.[1][3] | Consume events/results, not TUI rendering. Event records are an observation stream, not an operation-specific RPC request/response API. |
| Print | `ctx.mode === "print"`, `ctx.hasUI === false`; extensions still run but cannot prompt, and `ctx.shutdown()` is a no-op because the process exits after prompts finish.[1] | Tools must not require UI. The returned model-visible content must stand on its own; do not rely on status/widgets/renderers as evidence. |

Additional RPC constraints:

- RPC framing is strict JSONL with LF as the record delimiter; Node's generic `readline` is explicitly called non-compliant because it also splits valid JSON strings on Unicode line separators.[4]
- Tool start/update/end events include `toolCallId`; partial results are accumulated snapshots rather than deltas.[4]
- `agent_end` can precede retry, compaction retry, or queued continuation. `agent_settled` means Pi will not continue automatically.[4]
- Extension errors are separately observable as `extension_error` in RPC.[4]

## Recommended v1 runtime contract

1. Register one namespaced Pi tool per bounded workflow operation.
2. Give every tool a closed, compatibility-conscious TypeBox schema; use `StringEnum` for portable enums and explicit unknown-key rejection where required.
3. Validate domain invariants again at the core Module boundary because hooks can mutate input without re-validation.
4. Model expected domain outcomes explicitly; throw for execution/runtime failures.
5. Propagate the tool signal through the Adapter and check before mutations; make mutation results reconcilable and idempotent where feasible.
6. Return compact structured evidence (`operation`, stable target id, outcome, changed/not-changed, before/after identifiers where safe); bound all model-visible content.
7. Keep UI optional. Render the same result in TUI, but make content/details sufficient in RPC, JSON, and print.
8. At client preflight, verify expected names **and** `sourceInfo`, then active status. Hard-stop if required operations are unavailable.
9. Start with static activation if the v1 catalog is small. If activation becomes necessary, use an additive loader and rely only on the universal fallback semantics, not provider-native deferred loading.
10. Namespace tools to avoid overrides; do not depend on extension load order or same-name warnings.

## Capabilities unsuitable as v1 dependencies

- Provider-native deferred tool schemas/search: useful optimization, but model/protocol/version-specific.[1]
- TUI-only custom components, overlays (documented as experimental), status lines, widgets, or confirmation dialogs as part of operation correctness.[1][4][5]
- Tool-name-only availability checks, interactive override warnings, or unknown-name activation as a hard guarantee.[1]
- Post-validation `tool_call` mutations as a safe normalization layer; they are not revalidated.[1]
- Arbitrary unbounded text output or local temp-file paths as the structured workflow result.[1]
- A returned `{error: ...}` payload as runtime failure signaling.[1]
- `agent_end` or RPC prompt acceptance as proof that the whole run settled successfully.[4]
- Extension load order as a stable domain composition protocol.[1]

## Residual uncertainties to resolve during specification/prototype

1. The public docs expose `sourceInfo` but do not state a stable, package-independent equality rule for identifying one expected extension across git/npm install layouts. The spec should define the accepted provenance predicate and test it against this package's actual installation modes.
2. The docs promise schema validation but do not specify the validator's complete treatment of coercion, formats, and unknown keys. Prototype representative schemas against the supported providers/runtime version and retain explicit domain validation.
3. Cancellation after a remote tracker accepts a mutation is necessarily Adapter/API-specific. GitHub mutation operations need reconciliation rules and idempotency evidence; Pi's signal alone cannot provide exactly-once semantics.
4. `tool_result` middleware can alter result/error presentation. The specification must decide which core result fields are authoritative for clients and whether an extension-composition preflight is needed.
5. Dynamic native support is identified by model family/version or explicit compatibility flags and may evolve. It should remain outside v1 acceptance criteria.
6. JSON mode documents event streaming, not a bidirectional command protocol. If an external workflow client needs request/response control, RPC or the SDK is the supported basis; JSON should remain an observability/export path.

## Primary sources

All Pi sources below are first-party files from the installed `@earendil-works/pi-coding-agent` package. The installed docs link to the owning official repository, [`earendil-works/pi-mono`](https://github.com/earendil-works/pi-mono).

1. **Pi Extensions**, installed: `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — sections “Tool Events,” “ExtensionContext,” “ExtensionAPI Methods,” “Custom Tools,” “Output Truncation,” “Dynamic Tool Loading,” “Error Handling,” and “Mode Behavior.” Official repository path: [`packages/coding-agent/docs/extensions.md`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md).
2. **Dynamic tools example**, installed: `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/dynamic-tools.ts`. Official repository path: [`packages/coding-agent/examples/extensions/dynamic-tools.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/examples/extensions/dynamic-tools.ts).
3. **Pi JSON Event Stream Mode**, installed: `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/json.md`. Official repository path: [`packages/coding-agent/docs/json.md`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/json.md).
4. **Pi RPC Mode**, installed: `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md` — protocol overview, prompt/abort/bash commands, lifecycle events, extension UI protocol, error handling, and types. Official repository path: [`packages/coding-agent/docs/rpc.md`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/rpc.md).
5. **Pi TUI Components**, installed: `/home/gm/.nvm/versions/node/v24.15.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md` — custom tools, cancellable loaders, component contract, and rendering constraints. Official repository path: [`packages/coding-agent/docs/tui.md`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/tui.md).
6. **Official implementation links named by the extension docs:** [`packages/coding-agent/src/modes/interactive/components/tool-execution.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/modes/interactive/components/tool-execution.ts) (tool rendering/fallback) and [`packages/coding-agent/src/core/tools/`](https://github.com/earendil-works/pi-mono/tree/main/packages/coding-agent/src/core/tools) (built-in result/truncation patterns).

## Local context consulted

- `AGENTS.md`
- `CONTEXT.md`
- `docs/adr/0001-matt-skill-routing.md`
- `docs/adr/0002-repo-conventions-config.md`
- `docs/adr/0003-review-ledger.md`
- `extensions/matt-workflow-pi-extension/vendor/mattpocock-skills/engineering/research/SKILL.md`
- GitHub issue #36 including comments (none at research time)
- GitHub map #35 at low resolution (title/body/labels/state)
