# Configuration examples

These files show the runner's supported JSON configuration. Copy an example and replace its target URL, IDs, and secret environment-variable names with values for your environment. The `REPLACE_WITH_...` strings are placeholders, not valid Red IDs. For Red's attack-strategy and dataset semantics, see the [SDK reference](https://docs.lakera.ai/docs/red/sdk-reference) and [dataset guide](https://docs.lakera.ai/docs/red/custom-datasets).

| Example | Use it for | Fields and options shown |
| --- | --- | --- |
| [ollama.json](ollama.json) | New or reused target with first-use recon; Ollama on the host | `targetName`, recon limits, `allowHttp`, static strategy, catalog plus custom objectives |
| [ollama-supplied-profile.json](ollama-supplied-profile.json) | Create or replace a target profile without recon | `targetProfile`, `appContext`, target response timeout |
| [tool-using-agent.json](tool-using-agent.json) | Profile a tool-using customer support agent | Ground-truth system prompt and JSON tool schemas, full profile, custom-objective options, authenticated OpenAI-compatible target, and execution/output/gate controls |
| [cartwise-app-context.yaml](cartwise-app-context.yaml) | Supply target profile context from YAML | `appDescription`, `allowedActions`, `forbiddenActions`, referenced by the tool-using example |
| [target-update.json](target-update.json) | Update a UI-created target before scanning it | `targetOptions` for target rename, profile replacement, response timeout, and single-turn setting |
| [red.json](red.json) | Reuse an existing target for a direct, multi-turn scan | `targetId`, explicit objectives, crescendo options, target authentication |
| [indirect.json](indirect.json) | Scan an instrumented stateful target with tool-response poisoning | Saved indirect objective, recon refresh, tool tracing, custom request/session/response fields, CA trust file, and per-request/session limits |
| [dataset.json](dataset.json) | Run a previously uploaded dataset against an existing target | `datasetId`, named scan, and concurrency; dataset scans omit objective, strategy, and language fields |
| [smoke.json](smoke.json) | Run the SDK's short canned-probe check | `smoke` strategy and optional custom probe strings; this is an SDK option beyond the four main UI scan types |
| [mock.json](mock.json) | Run the local synthetic fixture | `demo` adapter and `demoSafe` mode |
| [compose.json](compose.json) | Use the fixture from Docker Compose | Stateful fixture target and Compose service URL |
| [instrument-tool.mjs](instrument-tool.mjs) | Add tool tracing in an application runtime | Example integration point for the SDK's `interceptTool` helper; not a runner config |

## Field coverage

| Configuration area | Fields illustrated | Where to look |
| --- | --- | --- |
| Target connection | `url`, `adapter`, `allowHttp`, `model`, `authEnv`, `caFile` | `ollama.json`, `red.json`, `indirect.json` |
| Adapter behavior | `requestField`, `sessionField`, `responsePath`, `instrumented`, `demoSafe` | `indirect.json`, `mock.json` |
| Target profile | `targetName`, `targetId`, `targetProfile.name`, inline/YAML `appContext`, `appContextFile`, `allowedActions`, `forbiddenActions`, `responseTimeoutSeconds`, `singleTurn`, target updates by ID | `ollama.json`, `red.json`, `ollama-supplied-profile.json`, `tool-using-agent.json`, `target-update.json` |
| Ground truth | `systemPrompt`, `tools` | `tool-using-agent.json` |
| Recon | `refresh`, `timeoutSeconds`, `maxSessions`, `maxTurns` | `ollama.json`, `indirect.json` |
| Scan scope and strategy | `objectives`, all `customObjectives` fields, static `numberOfProbes`/`numberOfAttacksPerObjective`, adaptive `numberOfAttacksPerObjective`/`maxTurns`/`maxRetries`/`earlyStopScore`, indirect `numberOfAttacksPerObjective`, smoke probes | `ollama.json`, `tool-using-agent.json`, `red.json`, `indirect.json`, `smoke.json` |
| Other scan options | `datasetId`, `language`, `scanName` | `dataset.json`, `red.json` |
| Execution limits | `concurrency`, `timeoutSeconds`, `requestTimeoutSeconds`, `maxBytes`, `maxTurns`, `maxSessions` | `tool-using-agent.json`, `indirect.json` |
| Results and gate | `directory`, `includeSensitive`, `maxSuccessfulAttacks` | All Red JSON examples |

## Option notes

- `target.caFile` is a path inside the runner container. Mount the PEM bundle read-only at that path; see [deployment guidance](../docs/deployment.md#corporate-networking-and-private-cas).
- `targetProfile.appContextFile` and `targetOptions.appContextFile` are file paths inside the container. The CartWise YAML is copied into the image at `/app/examples/cartwise-app-context.yaml`; mount custom files read-only at their configured paths.
- `targetOptions.appContext` and `targetOptions.appContextFile` replace a target's stored profile; include a complete profile. `targetProfile.singleTurn` / `targetOptions.singleTurn` identifies a stateless target. Crescendo and Tool Response Poisoning require multi-turn targets.
- `red.groundTruth.tools` accepts an array of tool-definition objects or strings in runner config. The runner serializes the array for the pinned SDK. These are evaluator context; the runner does not execute the tools.
- In `indirect.json`, `execution.maxBytes` bounds an attack, outbound request body, and response body; `maxTurns` caps turns in one target session; `maxSessions` caps session attempts for the assessment. `red.recon` has separate session and turn caps.
- The indirect example's `requestField`, `sessionField`, and `responsePath` map the runner's stateful JSON exchange to an application's field names and response location. The default mapping is `message`, `sessionId`, and `reply`.
- Strategy-specific fields are grouped by strategy: static probe count, crescendo turn/retry/early-stop settings, or indirect attack count. The runner rejects options that don't match the selected strategy.
- For Standard/static scans, `numberOfProbes` is canonical; `numberOfAttacksPerObjective` is also accepted as an alias. Adaptive/crescendo and Tool Response Poisoning scans use `numberOfAttacksPerObjective` to set repeated runs per objective.
- `datasetId` refers to a dataset already uploaded in Red. Dataset creation and administration stay in Red; the runner fetches the dataset's conversation count before starting and fails the report closed if results do not cover each conversation exactly once.
- Set `output.includeSensitive` to `true` only when you want raw SDK result snapshots included in the output directory; those snapshots can contain attack conversations and target responses.
- `targetProfile.responseTimeoutSeconds` changes Red's deadline for a target reply and must be between 1 and 480 seconds. `execution.requestTimeoutSeconds` separately limits the runner's HTTP call to the target.
- `red.baseUrl` is intentionally fixed to the SDK's documented Red endpoint in this runner. It is not a supported endpoint override.
- Fields omitted from an example use the defaults in `src/config.mjs`; examples need not repeat every default.
