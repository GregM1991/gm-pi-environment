---
name: podcraft-episode-creation
description: Create and verify a Podcraft episode.
disable-model-invocation: true
---

# Podcraft Episode Creation

Produce one **ready, playable, feed-visible** episode.

## 1. Locate

Find a local Podcraft checkout. Accept a directory only when:

- `package.json` has `name: "podcraft"`;
- its scripts include `episode:create` and `episode:create-byos`;
- both referenced script files exist.

Prefer the current repository, then search the user's workspace. Set its absolute path as `PODCRAFT_ROOT`. If no checkout satisfies every check, stop and ask for its location.

**Complete when:** one validated `PODCRAFT_ROOT` exists.

## 2. Frame

Choose one content-authority branch:

- **Generated** — Podcraft may research and write from a topic plus summary. Load [references/generated.md](references/generated.md).
- **BYOS** — the supplied script is authoritative and Podcraft only renders and delivers it. Load [references/byos.md](references/byos.md).

Resolve the branch's required inputs. The series must already exist. Use the branch defaults for unspecified optional inputs.

**Complete when:** one branch is selected and all of its required inputs are concrete.

## 3. Preflight

From `PODCRAFT_ROOT`, check the local app:

```bash
curl -fsS "${PODCRAFT_HEALTH_URL:-http://127.0.0.1:5200/api/health}"
```

Confirm the chosen source file is nonempty and satisfies the loaded branch contract. If health fails, report the failed check and stop before episode creation.

Episode creation is a production side effect. When the user's request has not already authorized these exact inputs, present mode, series, title or topic, source path, and voice for confirmation.

**Complete when:** health passes, the source satisfies its contract, and the exact submission is authorized.

## 4. Create

Run the command from the loaded branch reference exactly once. Capture stdout, stderr, exit status, and any episode ID. A nonzero exit is a failed creation result, not permission to create another episode.

**Complete when:** the command reaches `ready` or returns preserved failure evidence.

## 5. Verify

When creation returns an episode ID or delivery URLs, load [references/verification.md](references/verification.md) and apply every relevant production and delivery check. Keep human listening quality separate from mechanical delivery.

**Complete when:** production and delivery gates have explicit pass/fail evidence and remaining human checks are named.

## Final report

Return mode, series, title or topic, episode ID, duration, URLs, gate results, failure evidence, and human review still required.
