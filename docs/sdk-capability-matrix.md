# SDK discovery and capability matrix

Discovery: 2026-11-23. **Documented** is not **package inspected** or **live verified**.

Official sources reviewed: [index](https://docs.lakera.ai/llms.txt), [SDK quickstart](https://docs.lakera.ai/docs/red/sdk-quickstart), [reference](https://docs.lakera.ai/docs/red/sdk-reference), [deployment](https://docs.lakera.ai/docs/red/sdk-deployment), [changelog](https://docs.lakera.ai/docs/red/sdk-changelog), [target reuse](https://docs.lakera.ai/docs/red/sdk-how-tos/reuse-a-target), [indirect attacks](https://docs.lakera.ai/docs/red/indirect-attacks), and [management API](https://docs.lakera.ai/docs/red/management-api-overview).

The changelog lists 0.13.0 (2026-11-20), for TypeScript and Python. `sdk/package.json` pins that **candidate**. Registry metadata and package integrity were confirmed on 2026-11-24; no claim is made that this is the latest published version. Node was chosen because built-in HTTP, abort, process and test APIs permit a dependency-free local prototype, and the SDK's session handler maps directly to these facilities.

| Requirement | Documented capability | Prototype / evidence |
| --- | --- | --- |
| UI target/profile reuse | `getTarget(id)` is read-only; target owns recon profile | ID mode is read-only; name mode supports first-use recon, explicit ID refresh and supplied-profile updates |
| Saved objectives | `createScan({objectives:[id]})`; generated target objective keys also usable | References IDs without copying definitions |
| Full saved assessment configuration | No policy-retrieval interface identified | Local ID selection, strategy and limits; absence not package-confirmed |
| Programmatic scans | `createScan`, `scan.run(handler)`, session async iteration | Documentation-derived adapter; no invented HTTP routes |
| Multi-turn | `crescendo`, session isolation, message abort signal | Local history or caller-owned UUID; stateless JSON restricted to static |
| Indirect attacks | `tool-response-poisoning`, `setSessionId`, target-side `interceptTool` | Instrumented stateful targets only; CI always incomplete until delivery proof verified |
| Evaluation | `getResults`: `ready`, per-objective verdicts, errors, optional evaluation | Polls readiness; errors/missing/empty results fail closed |
| Native export | `writeResults` and `getResults` | Optional `getResults` snapshot; no claim of byte parity with `writeResults` |
| Dashboard | Scan ID and dashboard link | Scan ID retained; no returned URL is followed |
| Restricted networks | Outbound HTTPS to `red-webhooks.lakera.ai:443`; proxy/CA settings | Image enables Node environment proxy support; network behavior unverified |
| Custom datasets | 0.13 changelog documents CRUD and `datasetId` | Deferred pending package inspection |
| Cancellation / UI work queue | No whole-scan cancel or claim/lease interface identified | Local worker termination only; remote work may remain active |

Management APIs concern folders, members, keys and audit records; they are not used as a policy/work-queue API. No management credential is needed. The management guide names US/EU tenancy endpoints, but SDK tenancy behavior remains unverified; this prototype accepts only the default SDK US endpoint.

## Installed-package verification — 2026-11-24

SDK 0.13.0 is installed under `sdk/node_modules` with a complete integrity-pinned lockfile. Inspected client, scan, session/message-loop, target-context implementations and declarations. The matrix above records initial documentation findings; basic target, scan, session and result APIs now also have package evidence.

`node --test sdk/contract.test.mjs` passes locally and in the SDK-equipped container. It uses the actual package with simulated transport, checking `getTarget`/`hasRecon`, saved-objective scan creation, async sessions, `setSessionId`, message abort signals, response submission and `getResults`. No live Red request is made.

Source inspection confirms scan creation disables retries, while start, response submission and result reads use retry helpers. `scan.run` can return after idle timeout and does not rethrow handler errors; `getResults` returns parsed JSON without establishing coverage itself. Local fail-closed handling and live completion/coverage verification remain necessary. The SDK uses global fetch; actual proxy, redirects, TLS and remote cancellation behavior still need validation.

Install repeatably with `npm ci --prefix sdk --ignore-scripts`. The host provider imports from the repository root, so installation under `sdk/` alone does not enable local Red CLI execution; the Red Docker image places dependencies correctly under `/app/node_modules` and was verified. npm audit reports a high-severity Zod advisory affecting the dependency tree; see [verification](verification.md). Follow the live validation procedure before release.

## Smallest platform enhancements

1. Versioned read-only assessment policies binding target, objectives and strategy, with digest provenance.
2. Explicit terminal/cancel state, planned/evaluated/failed counts, indirect delivery evidence and bounded results.
3. Idempotent scan creation keyed by runner run ID.
4. Later, scoped runner registration and outbound claim/lease/heartbeat/resume. These are proposals, not claimed capabilities.
