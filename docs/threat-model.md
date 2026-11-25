# Concise threat model

Scope: current runner source, demonstration target and deployment definitions. Generated from inspected source plus independent boundary review. SDK implementation, real networks, containers and cluster enforcement are unverified. This is an architecture threat model, not a claim that all vulnerabilities were discovered.

## Architecture and assets

Trusted operators provide configuration and secrets. A CLI supervises an SDK worker, which receives attacks, posts them to a private target, returns application responses to Red and sends evaluated results to the CLI for local publication. Application tool instrumentation is a separate optional runtime.

Assets: target and Red credentials; customer response/tool data; target tool privileges; runner memory/CPU and network authority; integrity of CI decisions; confidentiality and completeness of reports.

## Actors and assumptions

An attacker may control prompts, target responses and content carried in evaluation transcripts. They do not control administrator JSON configuration, environment, mount ownership, DNS or the installed SDK/runtime under this model. Compromise of those trusted dependencies is a separate supply-chain/operational risk requiring deployment controls. The worker has the parent's OS authority; its process boundary is for cancellation, not hostile-code isolation.

## Trust boundaries

| Boundary | Invariant and code evidence |
| --- | --- |
| Operator configuration → execution | Closed schema and fixed URL validation in `src/config.mjs:13`; parent sends one snapshot in `src/supervisor.mjs:17`, worker validates it in `src/worker.mjs:9` |
| Attack → target request | Only JSON body changes; destination/credential come from config. `src/target.mjs:10`, `:21`, `:28`; non-2xx including redirects rejected at `:32`; no shell/eval/template execution |
| Conversation → another conversation | Fresh UUID and local history at `src/target.mjs:9`; each handler creates a conversation at `src/worker.mjs:17`; remote state isolation/expiry remains application's duty |
| Target → Red | Own-property response extraction and string requirement at `src/target.mjs:44`; complete response sent by `src/worker.mjs:19`. Sensitive contents intentionally leave the boundary |
| SDK child → supervisor | Trusted SDK process messages and same identity; hard deadline/abort at `src/supervisor.mjs:7`; no claimed privilege sandbox or remote cancel |
| Evaluation → gate | Boolean verdict/error/readiness/objective checks at `src/reports.mjs:5`; indirect coverage forced incomplete at `:16`. SDK authoritative completion remains a prerequisite |
| Reports → automation | Allowlisted normalized fields, unique directories, exclusive fsynced writes and final manifest at `src/reports.mjs:22`, `:29`, `:47`; `scripts/consume.mjs` verifies file/hash/identity consistency |
| Container → customer infrastructure | Dedicated UID, no inbound ports, read-only filesystem, capabilities dropped and resource limits in Compose/Kubernetes; policy enforcement depends on actual runtime/CNI |

## Prioritized threat scenarios

These are scenarios and prerequisites, not claims of exploited vulnerabilities.

1. **Prompt-driven SSRF or code execution in the runner.** Attack text could ask to fetch another destination or execute commands. It is serialized as data into a fixed endpoint; no content-derived URL, shell or executable plugin exists. Redirects are rejected. DNS/routing compromise is out of this input model; enforce network egress separately.
2. **Cross-session contamination.** Shared history or attacker-chosen IDs could affect another assessment. Unique local history/UUID per handler and concurrent-turn rejection reduce this risk. The target must honor IDs and authenticate callers; applications that accept server-issued sessions need a reviewed adapter. SDK duplicate/redelivery semantics are unknown.
3. **False clean result.** Partial execution or missing verdicts could pass a pipeline. Empty/unready/error/unknown/missing-objective results and handler failures are incomplete. Indirect runs cannot pass without future delivery verification. SDK `ready` and expected probe completion require implementation/live confirmation; exact probe-count coverage is not established here.
4. **Resource exhaustion.** Oversized attacks/responses, stalled calls and result expansion could exhaust resources. Byte/turn/session/concurrency/deadline limits apply; worker heap and deployment memory limit failure impact. SDK result parsing occurs before the output-size check, so resource exhaustion remains possible and must yield a failed/missing manifest rather than a passing assessment.
5. **Report injection or disclosure.** Default normalized fields exclude transcripts, explanations and raw errors; IDs use a restrictive alphabet safe in generated XML. Sensitive snapshots are opt-in. Private file modes and trusted mounts protect local confidentiality. Consumers must escape data when rendering. Checksums detect corruption, not malicious rewriting by mount owners; external signing/immutable storage supplies authenticity.
6. **Application-side harmful actions.** A successful attack can cause the target to use real tools. Runner controls cannot prevent those effects without invalidating the assessment. Use staging identities, sandbox tools, least privilege and test data, especially with poisoning.
7. **Credential or customer data egress.** Target tokens stay in target request headers, but application responses may reveal secrets and are sent to Red. Tool tracing expands that data boundary. Scope keys, approve data processing and retention, restrict egress, and inspect actual SDK logging/redirect/proxy behavior before production.
8. **Interrupted local run leaves cloud work active.** Hard child termination bounds local execution but does not cancel remote scans or roll back target operations. Retain scan ID where available; reconcile in Red. Missing manifests are incomplete. Idempotent creation/cancel/status APIs would improve recoverability.

## Unresolved release prerequisites

Inspect and pin the published SDK and all dependencies; verify lifecycle, final status and proxy/TLS contracts; validate actual container/CNI/storage controls; prove indirect delivery before enabling a passing gate; test tenant/region support; sign releases and reports as required. The current US-only SDK endpoint, direct-only target routing and limited session contract are deliberate prototype constraints.
