# Check Point AI Red, from your private network

Run [Check Point AI Red](https://docs.lakera.ai/red) assessments against AI applications that are only reachable inside your organization. This repository adds a customer-hosted runner around the [official Red SDK](https://docs.lakera.ai/docs/red/sdk-quickstart): Red supplies attack generation and evaluation, while the runner relays sessions to your private target and writes results where your pipelines can use them.

The runner acts as an execution broker in your environment. It initiates outbound HTTPS connections to Red and connects to your application over your private network. Your target does not need a public endpoint, and the runner does not expose an inbound service. Model replies and assessment data are sent to Red for evaluation; this is private-network execution, not offline evaluation.

## What Red helps you assess

Red is Check Point's AI red teaming product for testing generative AI applications and agents. Its assessments can help teams:

- Find prompt extraction, instruction override, data exposure, unsafe output, and other application-specific risks.
- Use multi-turn attack strategies, and test indirect attacks through tool responses when target instrumentation is available. This runner's indirect delivery path remains under verification.
- Tailor scans using target profiles, ground-truth prompts and tool definitions, and custom objectives.
- Review attack conversations and evaluations in Red, and compare findings as systems change.

See the [AI Red Teaming overview](https://docs.lakera.ai/red), [getting-started guide](https://docs.lakera.ai/docs/red/quickstart), [SDK reference](https://docs.lakera.ai/docs/red/sdk-reference), and guides for [custom objectives](https://docs.lakera.ai/docs/red/custom-objectives) and [indirect attacks](https://docs.lakera.ai/docs/red/indirect-attacks).

## What this runner adds

- **Private target connectivity:** run the container beside a laptop-hosted, on-premises, or private-network application. Red does not connect directly to your target.
- **Customer-controlled execution:** configure target connectivity, secrets, concurrency, time limits, and output locally; run as a Docker container, Kubernetes Job/CronJob, or CI task.
- **Automation-ready results:** write JSON summaries and JUnit verdicts to a mounted directory, with manifests for integrity checks and configurable pass/fail gates.
- **Multiple endpoint styles:** call OpenAI-compatible or generic JSON endpoints, or connect to a stateful endpoint with isolated session IDs.
- **Repeatable test suites:** choose generated objective scans or run a pre-existing Red dataset through the same private runner.

This repository provides a lightweight runner, not a managed or vendor-supported appliance. It does not host Red, execute target tools, or make assessments offline. See [architecture and data boundaries](docs/architecture.md) for the request and response flow.

## Get started

[Follow the laptop quickstart](docs/getting-started.md) to run the synthetic demo, connect to local Ollama, configure a Red target, and inspect a report. For network and production deployment patterns, see [deployment](docs/deployment.md).

Browse the [configuration examples](examples/README.md) for profile, ground truth, direct and indirect scans, target adapters, and local demos.

## Documentation

- [Getting started: Docker demo and Ollama assessment](docs/getting-started.md)
- [Architecture, adapters, and data boundaries](docs/architecture.md)
- [Docker, Kubernetes, Helm, proxies, and CI](docs/deployment.md)
- [Reports and external consumption](docs/results.md)
- [SDK capability review and implementation gaps](docs/sdk-capability-matrix.md)
- [Threat model](docs/threat-model.md)
- [Verification status and independent reviews](docs/verification.md)
- [Product direction](docs/product.md)

## Development

The local synthetic demo and developer commands are in the [getting-started guide](docs/getting-started.md). See [verification status](docs/verification.md) for tested paths and remaining live-integration work.
