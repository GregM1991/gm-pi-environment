---
name: onepassword-agent-secret-flows
description: "Use 1Password safely in Hermes/agent workflows: migrate written API keys, inject secrets with op run, triage vault inventories for agent-safe automation, avoid transcript leaks, and handle OAuth/password-gated flows."
version: 1.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [1password, secrets, op, security, agents, oauth, credentials]
---

# 1Password Agent Secret Flows

Use this skill when the user wants to migrate API keys/passwords into 1Password, make secrets available to Hermes profiles/agents, review which secrets are safe for automation, produce 1Password inventory triage worksheets, or debug auth flows without leaking secrets into transcripts.

Core rule: **1Password is a secret injection layer, not a database for the model to read.** Agents should run commands that consume secrets, not commands that print secrets.

## Secret inventory triage for agent-safe automation

Use this section when Greg wants to review a large 1Password vault, decide which secrets are safe for agent automation, identify stale keys, or produce a human-reviewable migration/deletion worksheet.

Core rule: **triage from metadata first; never inspect or print secret values unless the user explicitly asks and the action is safe.** The goal is to make Greg review a compact, pre-shaped decision file, not hundreds of raw items.

### Metadata-first workflow

1. Gather item metadata only. Example:

   ```bash
   mkdir -p /home/gm/.agents/onepassword-inventory
   op item list --vault Personal --long --include-archive --format json > /home/gm/.agents/onepassword-inventory/personal-items-long.json
   ```

2. Build a compact markdown triage worksheet grouped by likely decision class. Do **not** give Greg a flat all-items checklist. Prefill suggested one-letter marks so he can skim and correct.
3. Use metadata signals only unless explicitly asked otherwise: `category`, `createdAt`, `updatedAt`, archive state, duplicate titles, tags, and title keywords such as `api`, `token`, `secret`, `bot`, `old`, `uat`, `sandbox`, `recovery`, `bank`, `card`.
4. Be explicit that 1Password CLI metadata is not a reliable “last used” source for arbitrary items. Treat `updatedAt` as “last edited”, not “last successfully used by a service”.
5. For delete decisions, prefer a safety ladder: `A` archive after quick verification; `D` delete only after confirming revoked/dead/duplicate; `R` rotate first for API keys, then store a new scoped credential in `Agents` and revoke the old Personal-vault secret.

### Worksheet groups and marks

Recommended groups:

- **A. Keep personal / exclude from Agents** — banking, identity, recovery codes, cards, personal logins, broad admin/root credentials.
- **B. Likely copy/rotate into Agents** — scoped API keys, bot tokens, service credentials needed by automation.
- **C. Automation-ish but high-risk/admin** — Cloudflare, GitHub broad PATs, restic/backup passwords, homelab/admin credentials; require careful scoping or rotation.
- **D. Duplicates or ambiguous names** — duplicate titles, generic `Login`, generic `Secure Note`, old SSH keys, unclear purpose.
- **E. Possibly stale** — old/test/UAT/sandbox/deprecated names or very old `updatedAt`.
- **F. Low-priority / probably leave alone** — ordinary personal logins with no agent use and no stale/delete signal.

Mark codes: `K` keep personal; `C` copy safe automation fields; `M` move eventually; `R` rotate first; `A` archive after verification; `D` delete only after confirming revoked/dead/duplicate; `N` rename/merge metadata; `?` investigate.

Inventory triage pitfalls:

- Do not ask Greg to personally classify hundreds of items from scratch; preclassify and let him correct questionable rows.
- Do not imply `updatedAt` proves a secret is active or inactive.
- Do not migrate recovery codes, banking credentials, identity documents, personal cards, or broad admin/root credentials into an agent-readable vault by default.
- Avoid duplicating long-lived API keys indefinitely. Rotation into a scoped agent-safe key is usually better than copying.

## New session notes to preserve

- During live 1Password web UI setup, give one step at a time and wait for Greg to report the next screen/options.
- Recommended agent vault: `Agents`; description: `Secrets intentionally exposed to automation agents via scoped 1Password service accounts and op run wrappers. Do not store personal passwords, recovery codes, banking credentials, or broad admin/root credentials here.`
- Recommended service account permissions: select only `Agents`; disable new vault creation; grant `Read items` only; leave `Write items` and `Share items` off; leave Environment access empty unless deliberately using 1Password Environments.
- Saving the service account token in Greg's Personal/Private vault is sane as an admin/recovery copy because service accounts cannot access those built-in vaults.
- Homelab service-account token file pattern: `/home/gm/.agents/secrets/onepassword/hermes-default-agent.env`, containing `OP_SERVICE_ACCOUNT_TOKEN=...`, file mode `600`, parent dirs `700`.
- Todoist initial item path: `op://Agents/todoist-cli-api-key/api_token`; verify field presence without printing values via `op item get todoist-cli-api-key --vault Agents --format json | jq '.title, .vault.name, [.fields[].label]'`.
- If copying existing personal-vault items into `Agents`, trim copies down to automation-safe fields; API-key flows do not need login passwords/recovery codes unless browser/login flows are intentionally required.
