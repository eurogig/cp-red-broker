# Verification and remaining release work

This repository is a functioning **local prototype**, not a completed live-platform integration. There was no Git repository at the supplied path; no commits/PR were created. Existing discovery notes were replaced with evidence-based status and implementation documentation.

## Automatic recon and refresh — 2026-11-24

`red.targetName` now creates/reuses a named relay target and supplies the local session handler for first-use recon. `targetId` remains read-only reuse; `targetProfile` remains explicit profile replacement. `red.recon.refresh:true` requires an existing target ID and refreshes recon before scanning. Automatic/refresh paths reject missing or partial recon output and recorded handler failures. All calls remain outbound; the target URL is not registered as a public endpoint.

Setup/recon has a separately enforced deadline (default 1800 seconds), concurrency 5, max 20 sessions and max 20 turns per session. Assessment counters and the default 3600-second deadline start fresh after setup; outbound target requests default to 600 seconds. The supervisor permits this timer transition only once. Kubernetes/Helm deadlines must exceed 5400 seconds to accommodate both phases and report publication. Killing the worker still does not guarantee remote cancellation.

Validation: 27 local tests including real HTTP, plus three installed-SDK contract tests. The SDK tests use simulated transport to exercise first-run recon messages, stored-profile reuse, explicit refresh and supplied-profile mode. Live recon and Ollama assessment remain unverified.

## Supplied profiles and objective selection — 2026-11-24

The runner now accepts either `red.targetId` (reuse, optionally updating ground truth) or `red.targetProfile` (name plus required appContext; explicit create/update). `red.groundTruth` passes the actual system prompt and tool definitions through the SDK; with target IDs it replaces the stored ground truth, and with named/supplied targets it is attached during target creation/reuse. Profile creation never passes a recon handler or sends an application endpoint to Red. Its returned target ID is retained in the summary. The default selection expands to the 23 public catalog IDs bundled in `src/objectives.mjs`; `customObjectives` adds scan-local definitions, with selected-result coverage enforced for both kinds. Explicit subsets and custom-only selection are supported. Default catalog objectives are rejected for indirect scans.

Validation: 21 local tests pass including HTTP. Two installed-SDK contract tests cover existing sessions and profile creation/catalog/custom serialization using simulated transport. These checks do not verify account access or live scan completion. Rebuild the Red image to use the new behavior.

## Reverification — 2026-11-24

Updated sandbox settings allow actual HTTP listeners and Docker daemon access. npm cache writes and Docker Buildx state writes still required approved execution outside the sandbox.

- `RUN_NETWORK_TESTS=1 npm test`: **16 passed, zero skipped or failed**, Node 24.3.0.
- HTTP demos: vulnerable exit 1, four findings in eight sessions; `DEMO_SAFE=1` exit 0.
- Compose image build and execution passed on Docker Desktop 4.99.0 / Engine 29.9.3. Report `results/90392a9b-9d5e-47a1-80a3-098726bc7dbd` passed `scripts/consume.mjs` integrity verification. Runtime inspection confirmed UID 10001, read-only filesystems, no port bindings and an internal network. Verification containers/network were removed.
- Helm lint, deployment invariant checks and Compose configuration validation passed.
- Configured corporate npm registry lookup and installation succeeded. SDK 0.13.0 plus four total installed packages are pinned in `sdk/package-lock.json`; lifecycle scripts were disabled. SDK integrity matches registry metadata.
- `node --test sdk/contract.test.mjs`: one installed-SDK contract test passed both locally and inside the Red image with networking disabled. It checks target reuse, scan options, session binding, message signals/responses and result retrieval using simulated fetch responses. This is not live service validation.
- Public npm access inside Docker failed with `ECONNRESET`. The configured corporate registry returned HTTP 200. Added an optional BuildKit npmrc secret; `docker build --secret id=npmrc,src=.npmrc --target red -t checkpoint-red-runner:verification .` then passed. The image resolves the SDK from the real provider and correctly rejects missing credentials.
- `npm audit --prefix sdk --json` reports two high-severity package entries for one Zod advisory (GHSA-mrhx-c7xc-m3w5): `zod` 3.25.76 and the dependent SDK. No forced downgrade was applied; exploitability and remediation remain unassessed.

Live credentials, target/objective IDs, service verdict parity, proxy/private-CA behavior, remote cancellation, indirect delivery and Kubernetes execution remain unverified. The lockfile is reproducible verification input, not release approval. Earlier results below are retained as historical context and superseded where noted above.

## Executed here

- Node 24.3: unit/component and child-process tests, including configuration rejection, false-clean prevention, separate conversation histories and IDs, fixed destinations, redirect/error handling using injected transport, response/turn limits, report checksums, tolerant gates, worker deadlines/abort and unsafe TLS environment rejection.
- Credential-free full CLI lifecycle: eight synthetic sessions, four findings with exit 1; safe fixture with exit 0; unreachable target with incomplete report/exit 2.
- Helm lint, Job and CronJob rendering; Docker Compose configuration parsing.
- Independent engineering and security-boundary reviews, followed by fixes described below.

Latest test run: **15 passed, 1 explicitly skipped HTTP test, 0 failures**. The root `package-lock.json` contains only the dependency-free local project; it does not pin or audit the SDK. Offline npm's zero-dependency audit output is not an SDK vulnerability assessment.

Injected transport tests exercise our request/response code; they are not evidence of actual network/proxy/TLS behavior. The in-process fixture is not an SDK emulator or a live Red assessment.

## Original environment limitations (2026-11-23)

| Check | Result |
| --- | --- |
| npm SDK lookup | Configured corporate registry DNS ENOTFOUND |
| Public Python registry | DNS resolution failed; no distribution installed |
| Public CDN package metadata | Web retrieval unavailable |
| SDK cache search | No matching package found in searched caches |
| HTTP demo | `listen EPERM` on localhost |
| Docker daemon | Socket permission denied |
| Kubernetes live/schema validation | No live cluster validation performed; offline structural checks only |
| Red credentials / live scan | No live assessment attempted |

The test suite skips its real HTTP test unless `RUN_NETWORK_TESTS=1`; it must pass on the release host. Missing environment capabilities are not treated as passing checks. At that time, the SDK lockfile could not be generated; the reverification above now supplies it.

## Review dispositions

Independent engineering review identified configuration reread races, unsupported stateless multi-turn scans, TLS bypass, session admission accounting and JUnit/tolerance ambiguity. Fixed by IPC config snapshots, static-only JSON, rejecting TLS bypass/explicit verification, balanced session counters and documented raw-verdict JUnit semantics.

Independent boundary review highlighted indirect false-clean risk, post-materialization result limits, remote cancellation uncertainty and data egress. Indirect assessments now always fail closed until delivery is verified. Heap/container limits mitigate memory exhaustion; SDK streaming limits remain open. Docs explicitly distinguish local termination from remote cancellation and describe response/tool data leaving the organization. No content-driven target destination or command execution path was found in that review. This is not an exhaustive vulnerability audit or a certification of the unavailable SDK.

Followup review confirmed the engineering fixes and deployment claims, and found an output-expansion gap. Fixed with compact native snapshots, bounded result entry counts and final per-file byte limits before publication. Coarse allowlisted failure codes aid diagnosis without raw error leakage. The report consumer can require `provider:red` to reject synthetic evidence in real pipelines.

## Live validation procedure

1. On an authorized connected host, retrieve/install candidate SDK 0.13.0; inspect its source, declarations, examples and integrity. Review and commit a complete lockfile. Confirm `getTarget`, `hasRecon`, `createScan`, session binding, message cancellation, `getResults`, readiness/error semantics and proxy behavior against actual implementation. Fix and add contract tests for any mismatch.
2. Run `npm test`, `RUN_NETWORK_TESTS=1 npm test`, `node scripts/demo.mjs --http`, `helm lint deploy/helm/red-runner`, `ruby scripts/validate-deploy.rb` and `docker compose config --quiet`. Expected vulnerable demo exit is 1. Build/run Compose and verify neither service publishes host ports.
3. Build the Red image after package verification. Configure a staging target/profile in the UI and save a narrowly scoped custom objective. Obtain a scoped Red Team key; no management API key is necessary. Run the synthetic target only on a private network reachable from the runner. Use `adapter:stateful`, its private `/chat` URL, and an approved target profile. It responds deterministically and is not representative of an LLM.
4. Run a small static scan, one objective and low concurrency. Verify the target stays unreachable from outside the private network, runner has no listening ports, packet/flow logs show only allowed egress, and application credentials never reach Red. Do not use production tools/data.
5. Compare exported SDK verdicts, errors and scan ID with the Red dashboard. Confirm profile/objective reuse without recon or target mutation. Verify incomplete target calls and timeouts cannot produce a passing gate. Check actual completion and planned/executed coverage semantics; documented `ready` alone has not been implementation-verified.
6. Test multi-turn history and stateful sessions concurrently, target timeouts, aborts, oversize bodies, malformed responses, redirects, wrong CAs, trusted private CA, corporate proxy/NO_PROXY and restricted egress. Verify shutdown stops local connections and reconcile remote scan state manually by ID.
7. For indirect tests, instrument the target with actual packaged SDK examples and sandboxed tools. Confirm the bound session ID, tool interception, returned poisoned value, injection delivery and evaluation. Until authoritative delivery evidence is integrated and tested, expect exit 2 even for negative verdicts.
8. Run hardened Docker, standalone Job/CronJob and Helm Job/CronJob in a test cluster. Perform API schema validation against the intended Kubernetes version, enforce CNI policy, test volume ownership/atomic publication, deadlines, OOM, SIGTERM and concurrent outputs. Verify native/sanitized exports and external consumer integrity handling.
9. Scan dependencies/image, pin base/application/action digests, generate SBOM, sign release, review key scope/rotation, result retention and data processing terms. Rerun independent security review against installed SDK and final deployment.

## Original acceptance status (see reverification above)

1–3 (private target, real container Red assessment, outbound-only execution): architecture/deployment provided, live/container/network demonstration pending.
4 (central reuse): documentation-derived target/objective references; actual SDK pending.
5–7 (isolation, mounted reports, automation outcomes): local process/transport tests pass; container mount and live verdict semantics pending.
8 (Compose/Kubernetes/Helm): authored and statically validated; runtime pending.
9 (enterprise security): controls and threat model provided; dependency/network/deployment review remains required.
10 (new-user deployment): documented, with explicit prerequisites and honest blockers; connected-host walkthrough still needed.
