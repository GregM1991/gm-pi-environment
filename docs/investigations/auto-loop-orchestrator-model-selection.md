# Auto-loop orchestrator model selection

Status: investigated against the locally installed Pi coding agent and `pi-subagents` documentation for GitHub issue #8.

## Conclusion

The model split is supported, but there is no declarative **Matt auto-loop-only** model setting.

- The parent orchestrator is the current Pi session. Pi selects that session's model from `defaultProvider`/`defaultModel`, a startup `--model` argument, or an interactive `/model` change.
- `pi-subagents` starts worker and reviewer child sessions. `subagents.agentOverrides.<name>.model` pins each builtin role independently of the parent. A child invocation may also supply a per-run `model`, and chain steps may select different models.
- `/matt-auto` is a phase inside the parent session, not a separately configured agent or child process. Changing phase does not automatically change the parent model. A `/model` change also changes the current session generally, not only the auto phase.

Therefore the practical auto-only split is to start (or switch) the parent session to the economical orchestrator model, then invoke `/matt-auto`; persistent role overrides keep worker and reviewer children on the stronger models. A machine-local default can make the economical model the default for **every** parent session on that machine, but cannot target only `/matt-auto`.

## Selection scopes and precedence

| Scope | Configuration surface | Effect |
| --- | --- | --- |
| Machine/user default | `defaultProvider`, `defaultModel`, and `defaultThinkingLevel` in `~/.pi/agent/settings.json` | Initial model for Pi sessions on that machine. This is not auto-loop-specific. |
| Project default | `.pi/settings.json` | Overrides user settings for trusted sessions in that project. Do not commit machine-specific choices here. |
| Session/startup | `pi --model provider/model[:thinking]` | Selects the parent model for the launched Pi process/session. Recommended way to isolate an auto run without changing defaults. |
| Current interactive session | `/model` | Switches the parent model from that point onward, across phases in the same session. |
| Child-agent role | `subagents.agentOverrides.worker.model` and `.reviewer.model` | Pins builtin roles across their runs; project overrides beat user overrides. |
| Child run/step | `model` on a `subagent` call, `/run agent[model=...]`, or a chain step | Overrides the selected child for that run/step, enabling per-phase child selection. |
| Child fallback default | `subagents.defaultModel` | Applies only to subagents without an explicit model; it is separate from the parent model. |

For child selection, documented explicit per-run model values and role overrides take precedence over the inherited/default child model. Agent frontmatter can also pin a model. The Matt auto-loop deliberately invokes the builtin `worker` and `reviewer` roles with fresh context, so the repository's role overrides are the stable configuration surface for those phases.

## Recommended split

Use an economical, tool-capable model with a sufficiently large context window for the long-lived **parent orchestrator**. Keep **worker** on a stronger coding model and **reviewer** on a strong model with a higher thinking level. Model IDs are intentionally placeholders below: availability, authentication, pricing, and quota are machine-specific.

Create the uncommitted machine overlay `~/.config/gm-pi-environment/settings.local.json`:

```json
{
  "defaultProvider": "ORCHESTRATOR_PROVIDER",
  "defaultModel": "ORCHESTRATOR_MODEL",
  "defaultThinkingLevel": "low",
  "enabledModels": [
    "ORCHESTRATOR_PROVIDER/ORCHESTRATOR_MODEL",
    "CHILD_PROVIDER/WORKER_MODEL",
    "CHILD_PROVIDER/REVIEWER_MODEL"
  ],
  "subagents": {
    "agentOverrides": {
      "worker": {
        "model": "CHILD_PROVIDER/WORKER_MODEL",
        "thinking": "low"
      },
      "reviewer": {
        "model": "CHILD_PROVIDER/REVIEWER_MODEL",
        "thinking": "high"
      }
    }
  }
}
```

This shape uses fields documented by Pi's settings schema and `pi-subagents`. Because bootstrap arrays replace rather than append, `enabledModels` must contain the complete desired cycle. The overlay is deep-merged over the portable base, so its nested role values replace the corresponding base values. Do not commit this file.

If economical orchestration should apply only to auto runs, leave the default out of the overlay and launch explicitly:

```bash
pi --model ORCHESTRATOR_PROVIDER/ORCHESTRATOR_MODEL:low
```

Then invoke `/matt-auto ...` in that session. The machine-local `subagents.agentOverrides` still pins children. Confirm the live child mapping after restarting/reloading Pi with `/subagents-models worker` and `/subagents-models reviewer`.

## Capability gap and operating recommendation

Pi currently lacks a model policy keyed by prompt/command/phase such as `matt.auto.orchestratorModel`, and the Matt extension cannot retroactively choose the model that interpreted the command without adding extension behavior that calls Pi's model-switch API. Such a feature would need an upstream Pi/Matt command hook or extension-owned setting that switches the parent model on auto entry and defines restoration behavior on exit. Restoration, resumed sessions, manual mid-run model changes, and failure handling would require explicit semantics.

Until that capability exists:

1. Prefer `pi --model ...` in a dedicated auto-loop session for an auto-only split.
2. Use the machine overlay for persistent worker/reviewer role pins.
3. Use a machine-wide parent default only when the cheaper model is acceptable for all new Pi sessions.
4. Do not change the parent's model between auto phases; the parent must consistently enforce queue ordering, fresh-child dispatch, verification, ledger, commit, and closeout constraints.
5. Trial a cheaper orchestrator on supervised, low-risk queues first. The documentation establishes selection mechanics, not behavioral fitness; no unattended comparative model evaluation was performed in this investigation.

## Primary evidence

Local installed documentation read for this investigation:

- Pi `README.md`, sections **Providers & Models**, **Sessions**, **Settings**, and **CLI Reference**: `/model`, `--model`, session behavior, and user/project settings scopes.
- Pi `docs/settings.md`, sections **Settings Files**, **Model & Thinking**, and **Example**: `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `enabledModels`, and user/project precedence.
- Pi `docs/extensions.md`, `pi.setModel(model)`: extensions can switch the active parent model, but no phase policy is built in.
- Pi `docs/sdk.md` and `examples/sdk/02-custom-model.ts`: SDK-created sessions accept one selected model and can change it at runtime.
- Pi `docs/models.md`: `models.json` describes model/provider registration and per-model metadata; it is not an agent assignment surface.
- `pi-subagents/README.md`, sections **Changing an agent's model**, **Builtin overrides**, and **Per-step overrides**: `subagents.defaultModel`, `agentOverrides`, per-run/step `model`, precedence, and `/subagents-models`.
- `pi-subagents/skills/pi-subagents/SKILL.md`: the same runtime model override and builtin-role configuration contract exposed to agents.

Related cross-references followed from the Pi README/settings material were `docs/models.md`, `docs/sessions.md`, `docs/extensions.md`, `docs/sdk.md`, and the SDK examples README and custom-model example. The installed Pi example subagent extension was also checked; it independently demonstrates agent-frontmatter model selection, while this environment uses the richer installed `pi-subagents` package.
