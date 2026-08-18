# PROTOTYPE — package-loaded Issue Transaction Host Profile handshake

This throwaway prototype answers [Prototype the package-loaded Host Profile handshake](https://github.com/GregM1991/gm-pi-environment/issues/75), under [Wayfinder map: Issue Transaction Host Profile for targeted AFK](https://github.com/GregM1991/gm-pi-environment/issues/68).

## Question

Can separately package-loaded Pi extensions provide a load-order-independent, exactly-one Host Profile request/offer handshake over `pi.events`, including function-bearing offers, typed zero/duplicate/malformed/failing-provider outcomes, cancellation, idempotent lease cleanup, `/reload` invalidation, and a supported adaptation from `createAgentSessionServices()` to the explicit `ApprovedPiSdkContext` shape?

This is planning evidence only. It does not implement the production Host Profile or the PR-centered Issue Transaction.

## Run

From this directory:

```bash
bun run run.ts
```

The harness creates isolated temporary Pi agent directories, loads the consumer and provider as separate local Pi packages, drives extension commands through Pi RPC mode, and writes `RESULTS.md`. It never installs packages into the live Pi configuration and never writes credentials into the prototype.

The SDK adaptation probe reads the host's existing non-secret default provider/model settings and asks Pi whether authentication is configured. It records only the selected provider/model identity and service-ownership booleans; it does not print or copy credentials.

## Deliberate limits

- The event protocol is a throwaway structural sketch, not the production Interface.
- The prototype uses the current Pi v0.84.2 runtime and records where behavior is implementation evidence rather than a documented guarantee.
- It does not provision GitHub Apps, credentials, authenticated Adapters, an AI gate, a fresh reviewer, or the destination Issue Transaction.
- A later RPC transport must preserve the same domain-level Host Profile and lease semantics; this prototype does not design that transport.
