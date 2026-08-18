# Issue 75 prototype results

Generated against Pi `0.84.2` by `bun run run.ts`.

## Verdict

The prototype supports the proposed package-loaded Host Profile Seam on the current Pi runtime. The request/offer collection and function-bearing payload behavior depend on the current synchronous EventEmitter-backed Implementation and therefore need a Matt-owned protocol, explicit validation, and regression coverage rather than being treated as a documented Pi guarantee.

| Probe | Result | Evidence |
|---|---|---|
| Consumer before provider | PASS | One valid offer was visible when emit() returned and resolved successfully. |
| Provider before consumer | PASS | Discovery at command invocation was independent of package load order. |
| Zero provider | PASS | Rejected before resolution with reason zero-provider. |
| Duplicate providers | PASS | Two valid offers were rejected atomically as duplicate-provider. |
| Malformed provider | PASS | An offer without a resolver was rejected as malformed-provider. |
| Provider failure | PASS | A resolver exception became provider-resolution-failed without a fallback. |
| Cancellation | PASS | The shared AbortSignal cancelled resolution and returned aborted. |
| SDK context adaptation | PASS | createAgentSessionServices() supplied owned services; host policy resolved openai-codex/gpt-5.6-sol explicitly. |
| Reload and cleanup | PASS | Reload removed stale subscriptions, created a fresh provider instance, and disposed the old held lease once. |

## Design consequences

- Discover at command invocation, after all package factories have loaded; do not announce at factory time.
- Use a versioned request containing a callback and collect offers only during the synchronous `emit()` call. Reject zero, duplicate, malformed, or wrong-profile offers before resolution.
- Treat the registration and resolved lease as untrusted structural values. Provider identity claims need a separate source-provenance predicate in the specification.
- Pass one cancellation signal through discovery and resolution. Do not substitute another provider or fall back to `ctx.newSession` after any failure.
- Make lease disposal idempotent and run it both after transaction settlement and from `session_shutdown` as a safety net.
- Adapt `createAgentSessionServices()` by taking its `ModelRuntime`, `SettingsManager`, `ResourceLoader`, and `agentDir`, then resolving the model and allowed tools from explicit host policy. Do not copy Pi's private/default fallback algorithm.
- Keep the Host Profile Interface transport-neutral so a later RPC Adapter can preserve the same profile, lease, cancellation, and typed-failure semantics.

## Raw bounded evidence

```json
[
  {
    "name": "consumer-before-provider",
    "results": [
      {
        "at": "2026-08-18T02:26:16.593Z",
        "consumerInstanceId": "ca970969-b108-4903-8d09-e5231ab891a1",
        "requestId": "0efd107a-ef14-496f-b1df-1a2e9e66b5d1",
        "profileId": "gm.issue-transaction.default",
        "scenario": "normal",
        "offerCountAtEmitReturn": 1,
        "validOfferCount": 1,
        "malformedOfferCount": 0,
        "status": "resolved",
        "provider": {
          "id": "prototype-provider-a",
          "instanceId": "cda3c8d0-0065-4b24-a9c3-ca83cbe312a6",
          "packageId": "issue-75-prototype-provider-a"
        },
        "leaseId": "412f9d23-2f2a-4354-bf26-9538ee5898b3",
        "ping": "pong:prototype-provider-a:cda3c8d0-0065-4b24-a9c3-ca83cbe312a6",
        "disposeCount": 1
      }
    ],
    "lifecycle": [
      {
        "at": "2026-08-18T02:26:16.576Z",
        "event": "provider-loaded",
        "providerId": "prototype-provider-a",
        "instanceId": "cda3c8d0-0065-4b24-a9c3-ca83cbe312a6",
        "mode": "good"
      },
      {
        "at": "2026-08-18T02:26:16.592Z",
        "event": "lease-created",
        "providerId": "prototype-provider-a",
        "instanceId": "cda3c8d0-0065-4b24-a9c3-ca83cbe312a6",
        "leaseId": "412f9d23-2f2a-4354-bf26-9538ee5898b3",
        "scenario": "normal"
      },
      {
        "at": "2026-08-18T02:26:16.592Z",
        "event": "lease-disposed",
        "providerId": "prototype-provider-a",
        "instanceId": "cda3c8d0-0065-4b24-a9c3-ca83cbe312a6",
        "leaseId": "412f9d23-2f2a-4354-bf26-9538ee5898b3",
        "disposeCount": 1
      },
      {
        "at": "2026-08-18T02:26:16.593Z",
        "event": "provider-shutdown",
        "providerId": "prototype-provider-a",
        "instanceId": "cda3c8d0-0065-4b24-a9c3-ca83cbe312a6",
        "reason": "quit",
        "activeLeaseCount": 0
      }
    ]
  },
  {
    "name": "provider-before-consumer",
    "results": [
      {
        "at": "2026-08-18T02:26:16.606Z",
        "consumerInstanceId": "99d8a2e5-96d3-4e70-a391-032e16075cf8",
        "requestId": "f4ad5e93-960f-47a2-9029-8d3748186d6d",
        "profileId": "gm.issue-transaction.default",
        "scenario": "normal",
        "offerCountAtEmitReturn": 1,
        "validOfferCount": 1,
        "malformedOfferCount": 0,
        "status": "resolved",
        "provider": {
          "id": "prototype-provider-a",
          "instanceId": "adf13a6d-d851-4d08-b917-b7f5495f801c",
          "packageId": "issue-75-prototype-provider-a"
        },
        "leaseId": "c19d7290-340a-4601-841e-5170b8418245",
        "ping": "pong:prototype-provider-a:adf13a6d-d851-4d08-b917-b7f5495f801c",
        "disposeCount": 1
      }
    ],
    "lifecycle": [
      {
        "at": "2026-08-18T02:26:16.584Z",
        "event": "provider-loaded",
        "providerId": "prototype-provider-a",
        "instanceId": "adf13a6d-d851-4d08-b917-b7f5495f801c",
        "mode": "good"
      },
      {
        "at": "2026-08-18T02:26:16.606Z",
        "event": "lease-created",
        "providerId": "prototype-provider-a",
        "instanceId": "adf13a6d-d851-4d08-b917-b7f5495f801c",
        "leaseId": "c19d7290-340a-4601-841e-5170b8418245",
        "scenario": "normal"
      },
      {
        "at": "2026-08-18T02:26:16.606Z",
        "event": "lease-disposed",
        "providerId": "prototype-provider-a",
        "instanceId": "adf13a6d-d851-4d08-b917-b7f5495f801c",
        "leaseId": "c19d7290-340a-4601-841e-5170b8418245",
        "disposeCount": 1
      },
      {
        "at": "2026-08-18T02:26:16.607Z",
        "event": "provider-shutdown",
        "providerId": "prototype-provider-a",
        "instanceId": "adf13a6d-d851-4d08-b917-b7f5495f801c",
        "reason": "quit",
        "activeLeaseCount": 0
      }
    ]
  },
  {
    "name": "zero-provider",
    "results": [
      {
        "at": "2026-08-18T02:26:16.584Z",
        "consumerInstanceId": "b631e6c2-a56a-4ac6-aba5-c311dd69791e",
        "requestId": "8e7c98b6-ca5b-437f-be6c-bfbe3f484712",
        "profileId": "gm.issue-transaction.default",
        "scenario": "normal",
        "offerCountAtEmitReturn": 0,
        "validOfferCount": 0,
        "malformedOfferCount": 0,
        "status": "rejected",
        "reason": "zero-provider"
      }
    ],
    "lifecycle": []
  },
  {
    "name": "duplicate-provider",
    "results": [
      {
        "at": "2026-08-18T02:26:16.640Z",
        "consumerInstanceId": "18d2ef40-9547-4cbb-a6d6-f83abcf28501",
        "requestId": "304173d5-a4df-4600-bd55-3836fd71b805",
        "profileId": "gm.issue-transaction.default",
        "scenario": "normal",
        "offerCountAtEmitReturn": 2,
        "validOfferCount": 2,
        "malformedOfferCount": 0,
        "status": "rejected",
        "reason": "duplicate-provider",
        "providers": [
          "prototype-provider-a",
          "prototype-provider-b"
        ]
      }
    ],
    "lifecycle": [
      {
        "at": "2026-08-18T02:26:16.623Z",
        "event": "provider-loaded",
        "providerId": "prototype-provider-a",
        "instanceId": "e6a932bd-86f0-4d9d-a91e-9b080159f8d7",
        "mode": "good"
      },
      {
        "at": "2026-08-18T02:26:16.628Z",
        "event": "provider-loaded",
        "providerId": "prototype-provider-b",
        "instanceId": "7063d830-e10b-4b50-8de1-7c148a64b326",
        "mode": "good"
      },
      {
        "at": "2026-08-18T02:26:16.640Z",
        "event": "provider-shutdown",
        "providerId": "prototype-provider-a",
        "instanceId": "e6a932bd-86f0-4d9d-a91e-9b080159f8d7",
        "reason": "quit",
        "activeLeaseCount": 0
      },
      {
        "at": "2026-08-18T02:26:16.640Z",
        "event": "provider-shutdown",
        "providerId": "prototype-provider-b",
        "instanceId": "7063d830-e10b-4b50-8de1-7c148a64b326",
        "reason": "quit",
        "activeLeaseCount": 0
      }
    ]
  },
  {
    "name": "malformed-provider",
    "results": [
      {
        "at": "2026-08-18T02:26:16.601Z",
        "consumerInstanceId": "5e4c7691-b467-41db-a1d8-e2e1a8d7d9a3",
        "requestId": "0516528f-4aac-440d-be1c-421d2f452655",
        "profileId": "gm.issue-transaction.default",
        "scenario": "normal",
        "offerCountAtEmitReturn": 1,
        "validOfferCount": 0,
        "malformedOfferCount": 1,
        "status": "rejected",
        "reason": "malformed-provider"
      }
    ],
    "lifecycle": [
      {
        "at": "2026-08-18T02:26:16.582Z",
        "event": "provider-loaded",
        "providerId": "prototype-provider-malformed",
        "instanceId": "741bd918-c6ad-4b2e-96da-05f1e290d3c3",
        "mode": "malformed"
      },
      {
        "at": "2026-08-18T02:26:16.602Z",
        "event": "provider-shutdown",
        "providerId": "prototype-provider-malformed",
        "instanceId": "741bd918-c6ad-4b2e-96da-05f1e290d3c3",
        "reason": "quit",
        "activeLeaseCount": 0
      }
    ]
  },
  {
    "name": "failing-provider",
    "results": [
      {
        "at": "2026-08-18T02:26:16.589Z",
        "consumerInstanceId": "56571cb8-c7f8-4ef9-a1a6-19bd2fc2d109",
        "requestId": "a5891226-d032-489f-99f1-9bafc1d90358",
        "profileId": "gm.issue-transaction.default",
        "scenario": "normal",
        "offerCountAtEmitReturn": 1,
        "validOfferCount": 1,
        "malformedOfferCount": 0,
        "status": "rejected",
        "reason": "provider-resolution-failed",
        "message": "Prototype provider failed before lease construction."
      }
    ],
    "lifecycle": [
      {
        "at": "2026-08-18T02:26:16.570Z",
        "event": "provider-loaded",
        "providerId": "prototype-provider-failing",
        "instanceId": "3b51eee3-f4cb-44fa-946c-b9add830a78b",
        "mode": "failing"
      },
      {
        "at": "2026-08-18T02:26:16.590Z",
        "event": "provider-shutdown",
        "providerId": "prototype-provider-failing",
        "instanceId": "3b51eee3-f4cb-44fa-946c-b9add830a78b",
        "reason": "quit",
        "activeLeaseCount": 0
      }
    ]
  },
  {
    "name": "cancelled-resolution",
    "results": [
      {
        "at": "2026-08-18T02:26:16.595Z",
        "consumerInstanceId": "68492d9d-8edb-4e2f-bd97-39f84b37ac00",
        "requestId": "e08db8be-6698-45aa-8bf8-9557a70e238a",
        "profileId": "gm.issue-transaction.default",
        "scenario": "cancel",
        "offerCountAtEmitReturn": 1,
        "validOfferCount": 1,
        "malformedOfferCount": 0,
        "status": "rejected",
        "reason": "aborted",
        "message": "Host Profile resolution was aborted."
      }
    ],
    "lifecycle": [
      {
        "at": "2026-08-18T02:26:16.563Z",
        "event": "provider-loaded",
        "providerId": "prototype-provider-a",
        "instanceId": "f3f20fad-aede-49bd-a9d2-a5c3d281922c",
        "mode": "good"
      },
      {
        "at": "2026-08-18T02:26:16.596Z",
        "event": "provider-shutdown",
        "providerId": "prototype-provider-a",
        "instanceId": "f3f20fad-aede-49bd-a9d2-a5c3d281922c",
        "reason": "quit",
        "activeLeaseCount": 0
      }
    ]
  },
  {
    "name": "sdk-context-adaptation",
    "results": [
      {
        "at": "2026-08-18T02:26:17.725Z",
        "consumerInstanceId": "bb6c1490-f5ce-4de5-b735-3a4946815724",
        "requestId": "1df2ebb0-ebb2-46ef-bac4-1d650cb368b9",
        "profileId": "gm.issue-transaction.default",
        "scenario": "sdk",
        "offerCountAtEmitReturn": 1,
        "validOfferCount": 1,
        "malformedOfferCount": 0,
        "status": "resolved",
        "provider": {
          "id": "prototype-provider-a",
          "instanceId": "6a1d0751-7914-4220-8bdb-c4a56eb409e1",
          "packageId": "issue-75-prototype-provider-a"
        },
        "leaseId": "5083efb0-43d0-459f-8c46-cbcc38143c45",
        "ping": "pong:prototype-provider-a:6a1d0751-7914-4220-8bdb-c4a56eb409e1",
        "disposeCount": 1,
        "sdkContext": {
          "id": "gm.issue-transaction.default",
          "agentDir": "<host-agent-dir>",
          "model": "openai-codex/gpt-5.6-sol",
          "allowedTools": [
            "read",
            "bash",
            "edit",
            "write"
          ],
          "diagnostics": {
            "info": 0,
            "warning": 0,
            "error": 0
          },
          "ownsModelRuntime": true,
          "ownsSettingsManager": true,
          "ownsResourceLoader": true
        }
      }
    ],
    "lifecycle": [
      {
        "at": "2026-08-18T02:26:16.615Z",
        "event": "provider-loaded",
        "providerId": "prototype-provider-a",
        "instanceId": "6a1d0751-7914-4220-8bdb-c4a56eb409e1",
        "mode": "good"
      },
      {
        "at": "2026-08-18T02:26:17.725Z",
        "event": "lease-created",
        "providerId": "prototype-provider-a",
        "instanceId": "6a1d0751-7914-4220-8bdb-c4a56eb409e1",
        "leaseId": "5083efb0-43d0-459f-8c46-cbcc38143c45",
        "scenario": "sdk"
      },
      {
        "at": "2026-08-18T02:26:17.725Z",
        "event": "lease-disposed",
        "providerId": "prototype-provider-a",
        "instanceId": "6a1d0751-7914-4220-8bdb-c4a56eb409e1",
        "leaseId": "5083efb0-43d0-459f-8c46-cbcc38143c45",
        "disposeCount": 1
      },
      {
        "at": "2026-08-18T02:26:17.727Z",
        "event": "provider-shutdown",
        "providerId": "prototype-provider-a",
        "instanceId": "6a1d0751-7914-4220-8bdb-c4a56eb409e1",
        "reason": "quit",
        "activeLeaseCount": 0
      }
    ]
  },
  {
    "name": "reload-and-cleanup",
    "results": [
      {
        "at": "2026-08-18T02:26:16.635Z",
        "consumerInstanceId": "5bdad9a4-8f70-4b0c-8bd8-908462f90533",
        "requestId": "75675348-b043-4443-b68a-3d9f31e349c9",
        "profileId": "gm.issue-transaction.default",
        "scenario": "hold",
        "offerCountAtEmitReturn": 1,
        "validOfferCount": 1,
        "malformedOfferCount": 0,
        "status": "held",
        "provider": {
          "id": "prototype-provider-a",
          "instanceId": "e0730746-49ea-4224-8058-d87f7427b8a2",
          "packageId": "issue-75-prototype-provider-a"
        },
        "leaseId": "df78a591-8a73-45f1-827a-e63921faff13",
        "ping": "pong:prototype-provider-a:e0730746-49ea-4224-8058-d87f7427b8a2",
        "disposeCount": 0
      },
      {
        "at": "2026-08-18T02:26:16.644Z",
        "consumerInstanceId": "48d843d0-1552-425f-b5f8-ebc63a518e89",
        "requestId": "4a9f9422-74e2-4a27-9904-3b341b9cdee1",
        "profileId": "gm.issue-transaction.default",
        "scenario": "normal",
        "offerCountAtEmitReturn": 1,
        "validOfferCount": 1,
        "malformedOfferCount": 0,
        "status": "resolved",
        "provider": {
          "id": "prototype-provider-a",
          "instanceId": "fda8a97c-abd0-4543-8323-7fc0909479bf",
          "packageId": "issue-75-prototype-provider-a"
        },
        "leaseId": "433d1216-1793-4f3a-9ba1-998d132bcbed",
        "ping": "pong:prototype-provider-a:fda8a97c-abd0-4543-8323-7fc0909479bf",
        "disposeCount": 1
      }
    ],
    "lifecycle": [
      {
        "at": "2026-08-18T02:26:16.622Z",
        "event": "provider-loaded",
        "providerId": "prototype-provider-a",
        "instanceId": "e0730746-49ea-4224-8058-d87f7427b8a2",
        "mode": "good"
      },
      {
        "at": "2026-08-18T02:26:16.635Z",
        "event": "lease-created",
        "providerId": "prototype-provider-a",
        "instanceId": "e0730746-49ea-4224-8058-d87f7427b8a2",
        "leaseId": "df78a591-8a73-45f1-827a-e63921faff13",
        "scenario": "hold"
      },
      {
        "at": "2026-08-18T02:26:16.636Z",
        "event": "provider-shutdown",
        "providerId": "prototype-provider-a",
        "instanceId": "e0730746-49ea-4224-8058-d87f7427b8a2",
        "reason": "reload",
        "activeLeaseCount": 1
      },
      {
        "at": "2026-08-18T02:26:16.636Z",
        "event": "lease-disposed",
        "providerId": "prototype-provider-a",
        "instanceId": "e0730746-49ea-4224-8058-d87f7427b8a2",
        "leaseId": "df78a591-8a73-45f1-827a-e63921faff13",
        "disposeCount": 1
      },
      {
        "at": "2026-08-18T02:26:16.640Z",
        "event": "provider-loaded",
        "providerId": "prototype-provider-a",
        "instanceId": "fda8a97c-abd0-4543-8323-7fc0909479bf",
        "mode": "good"
      },
      {
        "at": "2026-08-18T02:26:16.643Z",
        "event": "lease-created",
        "providerId": "prototype-provider-a",
        "instanceId": "fda8a97c-abd0-4543-8323-7fc0909479bf",
        "leaseId": "433d1216-1793-4f3a-9ba1-998d132bcbed",
        "scenario": "normal"
      },
      {
        "at": "2026-08-18T02:26:16.644Z",
        "event": "lease-disposed",
        "providerId": "prototype-provider-a",
        "instanceId": "fda8a97c-abd0-4543-8323-7fc0909479bf",
        "leaseId": "433d1216-1793-4f3a-9ba1-998d132bcbed",
        "disposeCount": 1
      },
      {
        "at": "2026-08-18T02:26:16.644Z",
        "event": "provider-shutdown",
        "providerId": "prototype-provider-a",
        "instanceId": "fda8a97c-abd0-4543-8323-7fc0909479bf",
        "reason": "quit",
        "activeLeaseCount": 0
      }
    ]
  }
]
```
