# Architecture and boundaries

The CLI validates operator JSON once, creates a private UUID report directory, and sends the configuration snapshot to one child. The child uses either fixtures or the SDK. Red owns policy content, attack generation and evaluation; local code owns connectivity and execution limits.

```text
Operator config + secret environment
                 |
          CLI supervisor --> local reports
                 |
           SDK worker --outbound HTTPS--> Red
                 |
             private HTTP(S)
                 |
           private application
```

Application responses return through the worker to Red. Instrumented tool tracers additionally connect directly from the application to Red. The runner has no listener, inbound service or control API. The demo target is a separate fixture, with a private listener in HTTP mode.

| Module | Responsibility |
| --- | --- |
| `config.mjs` | Closed schema, defaults, bounds |
| `cli.mjs`, `supervisor.mjs` | Identity, snapshot, child lifecycle and publication |
| `worker.mjs` | Provider-to-target session relay |
| `providers.mjs` | SDK calls or synthetic fixture generation/evaluation |
| `target.mjs` | HTTP, authentication, TLS, response extraction and history |
| `reports.mjs` | Fail-closed normalization, gate, publication |
| `scripts/consume.mjs` | Manifest verification |

The child is a lifecycle boundary, **not a privilege sandbox**; it inherits the same OS identity and environment. Deadline/SIGTERM/SIGINT kills it even if SDK promises hang and publishes an incomplete report when possible. SIGKILL, process crash or filesystem failure can leave no manifest. Killing local execution does not cancel Red server work or undo a target operation already received. No automatic target retries or scan-creation retries are added.

## Target contracts

All adapters POST JSON to one fixed configured URL. Redirects/non-2xx fail. No URL, path, header or command is derived from attacks or responses. URL credentials, query strings and fragments are rejected; use `authEnv` for bearer credentials. `caFile` is a target-specific trust bundle. No expression language, dynamic URL templates, runtime code plugins or shell execution exists.

- **openai:** configured model, `stream:false`, per-session `messages`; extracts `choices[0].message.content`. Runner does not execute tools or support streams.
- **json:** `{message:attack}` and extracts `reply`, with configurable `requestField` and own-property `responsePath`. Stateless; only static Red attacks are allowed.
- **stateful:** adds a fresh UUID `sessionId`, repeated across that conversation. Application must accept caller-owned IDs, isolate state by them and expire it. IDs do not come from prompts or responses. APIs needing server-issued sessions or create/delete calls need a reviewed adapter.
- **demo:** mock-only in-process synthetic target, explicitly marked `provider:mock` in results.

Each SDK session gets a fresh conversation. Concurrent turns in one conversation fail; separate sessions may run concurrently. Local history is discarded at completion. The remote application owns its cleanup. Independence of multiple static probes within SDK sessions needs SDK verification; runner does not reset remote state between individual probes.

## Indirect testing

Ordinary endpoint connectivity cannot expose internal tools. The application must use the SDK's `interceptTool` at tool boundaries and actually consume its returned value. Bind the authenticated request session ID to the worker's `setSessionId`; never extract that ID from prompt text. See `examples/instrument-tool.mjs`, a documentation-derived sketch, not an executed example.

The target runtime needs its own Red credential, outbound access, tracing enabled and sandboxed tools. Poisoned tool results can induce real actions; runner destination controls cannot constrain application tools. Use staging identities, test data and sandbox services.

`instrumented:true` only acknowledges a prerequisite. Until reliable injection-delivery evidence is verified, **all indirect runs return incomplete/exit 2**, retaining observed successes. Negative verdicts cannot certify coverage.

## What leaves the organization

Red receives target/objective IDs, strategy/settings, session bindings and the complete extracted application response each turn. Target context/ground truth previously configured in Red remains there. Red generates attacks and evaluates conversations remotely. Tracing additionally sends tool names, arguments and real results from the application runtime. These can contain confidential information.

The local target URL, credential, report path and CA path are not intentionally supplied to Red. Responses themselves may disclose private URLs, credentials or other data; this runner does not redact them before evaluation. Outbound-only describes connectivity, **not local processing, air-gap operation or data sovereignty**. Review region and retention commitments with the platform owner. `includeSensitive:false` governs local export only, not Red ingestion.

## Limits and residual dependencies

Request/response bytes, history, turns, sessions, concurrency and duration are bounded. Worker V8 old-generation heap is capped at 384 MiB; this excludes other memory such as Buffers. Deployments cap total container memory at 768 MiB. The 20 MiB raw-result check occurs after SDK materialization; it is not an ingestion limit. Results are limited to 100,000 entries and published files to 25 MiB each; native snapshots are compact. SDK parsing/retries/pagination remain unverified. DNS, network routes, proxy and operator configuration are trusted inputs; enforce egress policy against compromised DNS/runtime/dependencies. No distributed registration or orchestration is implemented.
