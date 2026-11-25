# Deployment

All deployment paths use the same CLI and configuration. The Red image includes the SDK; the `demo` build stage deliberately excludes it. A run exits; do not use a continuously restarted Deployment for assessments. Kubernetes Job retries are zero because restarting a failed scan can create new cloud work. Use CronJob `concurrencyPolicy:Forbid` for schedules.

## Local and Docker demo

`npm run demo` uses no sockets or third-party dependencies. `node scripts/demo.mjs --http` uses an actual localhost target. Both expect exit 1 by default; set `DEMO_SAFE=1` for a clean fixture.

On a Docker host, create `results` and give UID/GID 10001 write access (for example `install -d -m 0700 results` and an administrator-approved ownership change on Linux). Do not use chmod 777. Compose uses a bind mount so artifacts remain directly accessible on the host; account for Docker Desktop versus Linux ownership behavior.

```sh
docker compose config --quiet
docker compose up --build --abort-on-container-exit --exit-code-from runner
docker compose down
```

Compose has no published ports; both services join an internal-only bridge. This is a credential-free demonstration, not a live Red deployment: its internal network intentionally blocks internet access. For live operation the runner needs an additional egress-capable network or approved proxy route, while the private target remains unexposed. Do not add host ports to either service.

## Prepare the Red runtime

SDK 0.13.0 and its dependencies are now pinned in `sdk/package-lock.json`. The Dockerfile requires this lockfile. The configured corporate registry works; direct public npm access from Docker failed during verification. Use the optional BuildKit secret below to supply registry configuration without copying it into image layers.

```sh
npm ci --prefix sdk --ignore-scripts
node --test sdk/contract.test.mjs
docker build --secret id=npmrc,src=.npmrc --target red -t checkpoint-red-runner:0.1.0 .
# Omit --secret when public npm is directly reachable.
```

Inspect version 0.13.0 and update the adapter if its actual API differs. No install lifecycle scripts are permitted. Run dependency/image vulnerability checks and generate an SBOM on the connected release host. Pin the tested Node base and deployed runner image to immutable approved digests before production. The current Node tag is a reproducible version intent, not an immutable supply-chain pin. Rebuild regularly for security updates.

## Docker Desktop: choose where the target runs

`--network` selects a **Docker network name**, not a company name, VPN, subnet or Kubernetes namespace. The former `CUSTOMER_PRIVATE_NETWORK` placeholder meant an existing Docker network shared with the target. Most laptop tests against an application running directly on the laptop do not need a custom network.

| Target location | `target.url` example | Runner networking |
| --- | --- | --- |
| Application on your laptop, port 8000 | `http://host.docker.internal:8000/v1/chat/completions` | Default bridge; omit `--network` |
| Another Docker container named `my-chatbot`, port 8000 | `http://my-chatbot:8000/v1/chat/completions` | Both containers join `red-test` |
| Internal HTTPS application reachable through your VPN | `https://ai.internal.example/v1/chat/completions` | Default bridge, provided Docker can reach VPN DNS/routes |
| Kubernetes Service `chatbot` in namespace `apps`, port 8000 | `http://chatbot.apps.svc.cluster.local:8000/v1/chat/completions` | Run a Job in the cluster; no Docker `--network` option |

These URLs assume an OpenAI-compatible application. Use its actual port/path/model and the matching adapter. In a container, `localhost` refers to that container. Docker Desktop provides [host.docker.internal](https://docs.docker.com/desktop/features/networking/networking-how-tos/) to reach the laptop; user-defined [bridge networks](https://docs.docker.com/engine/network/drivers/bridge/) provide container-name DNS. A VPN connection on the laptop does not guarantee container access; verify its DNS, firewall and routing.

### 1. Application running directly on your laptop

Build the Red image as above, then prepare the configuration:

```sh
cp examples/red.json runner.json
mkdir -p results
```

Edit `runner.json`: set an existing Red target ID or supply `red.targetProfile` as in the [Ollama quickstart](getting-started.md#4-configure-and-run-red), select objectives, and set the actual model. Omitted objectives select the 23 bundled public defaults; inline `customObjectives` are added to that selection. Set `target.url` to `http://host.docker.internal:8000/v1/chat/completions` and add `"allowHttp": true` inside `target` for this local HTTP endpoint. Keep `output.directory` as `/results`. The application must already be listening on port 8000 on an interface reachable from Docker Desktop.

Have `LAKERA_RED_API_KEY` and, if required by the application, `TARGET_API_KEY` exported in your shell through your normal secret tooling. If the target requires no authentication, remove `target.authEnv` from the configuration and omit `-e TARGET_API_KEY`. The Red key is still required for a live assessment.

Run from the repository root (POSIX shell, such as macOS Terminal or WSL):

```sh
docker run --rm --init --read-only --user 10001:10001 \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 768m --cpus 1 --pids-limit 64 \
  -e LAKERA_RED_API_KEY -e TARGET_API_KEY \
  --mount "type=bind,src=$PWD/runner.json,dst=/config/runner.json,readonly" \
  --mount "type=bind,src=$PWD/results,dst=/results" \
  checkpoint-red-runner:0.1.0
```

There is no custom network to create and no runner port to publish. The default bridge provides outbound connectivity, subject to host network policy. For an internal HTTPS application, use this same command with its actual HTTPS URL and omit `allowHttp`. On native Linux Engine, reaching the host may additionally require `--add-host host.docker.internal:host-gateway` and a reachable host listening interface. The results directory must be writable by container UID 10001; see the ownership notes above.

### 2. Application running in another Docker container

For an **already running** application container named `my-chatbot`, listening on port 8000 inside its container:

```sh
docker network create red-test
docker network connect red-test my-chatbot
```

Do this setup once. Set `target.url` in `runner.json` to `http://my-chatbot:8000/v1/chat/completions` and `target.allowHttp` to `true`. Then run:

```sh
docker run --rm --init --read-only --user 10001:10001 \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 768m --cpus 1 --pids-limit 64 \
  --network red-test \
  -e LAKERA_RED_API_KEY -e TARGET_API_KEY \
  --mount "type=bind,src=$PWD/runner.json,dst=/config/runner.json,readonly" \
  --mount "type=bind,src=$PWD/results,dst=/results" \
  checkpoint-red-runner:0.1.0
```

Use the application's container port, not a host-published port. Its server must listen on a container-reachable interface, usually `0.0.0.0`. No host port publication is needed for this connection. `red-test` is an ordinary user-defined bridge with outbound connectivity; its name does not enforce an egress allowlist. Do not add `--internal` to this single-network live example: the runner also needs outbound access to Red. The bundled Compose demo uses an internal network because it does not contact Red.

### Verbose scan dashboard

Set `-e RED_VERBOSE=1` and allocate a TTY with `-it` on `docker run` before the image name, alongside `-e LAKERA_RED_API_KEY`:

```sh
docker run --rm -it -e LAKERA_RED_API_KEY -e RED_VERBOSE=1 \
  --mount "type=bind,src=$PWD/runner.json,dst=/config/runner.json,readonly" \
  --mount "type=bind,src=$PWD/results,dst=/results" \
  checkpoint-red-runner:0.1.0
```

In an interactive terminal, verbose mode switches to a live, two-column view of the latest prompts and replies. The header shows phase, elapsed time, target/scan IDs, session counts, turns and timeouts; the final view adds the scan outcome and assessed/successful counts. It adapts to the current terminal size and keeps a bounded working set with only each session's latest exchange; it is not a transcript and does not provide scrollback. Resize the terminal at any time. Full prompts and replies can contain sensitive content.

Without a TTY, including Kubernetes and CI, verbose mode writes JSON trace lines to stdout as before. This makes it suitable for log collection and piping. Omit the variable or set it to `0` to disable verbose output.

| Event | Meaning |
| --- | --- |
| `session_start` | The handler bound a local conversation ID to an SDK session. |
| `prompt` | The handler received a prompt and is about to call the target adapter. |
| `reply` | The adapter returned the reply text shown here. |
| `response_submitted` | The SDK response call returned. This alone does not confirm remote evaluation. |
| `session_complete` | The SDK finished requesting prompts for this session. |
| `handler_error` | The handler encountered an error. The event carries a diagnostic category. |

A run that fails before the handler starts a session can show only stage and receipt lines even with verbose logging enabled. Check `diagnostic` in that run’s `summary.json` for the recorded failure category.

### What a successful run looks like

This is a batch command: it writes a JSON receipt with `runId`, report directory, `outcome` and `exitCode`, then exits. Exit **0** means completed within tolerance; **1** means completed with findings exceeding tolerance; **2** means incomplete or failed. Starting a container alone does not verify a live assessment. Verify the specific report named in the receipt with `node scripts/consume.mjs results/<run-id> red`.

The credential-free Compose run has been verified; these live commands require valid account IDs/credentials and reachable applications. Live Red assessment remains unverified here. Credentials are passed by environment variable name, not embedded in configuration or image layers.

## Corporate networking and private CAs

Only the Red SDK requires external HTTPS. The SDK deployment guide names `red-webhooks.lakera.ai:443`; DNS and any proxy must also be reachable. Allow only that destination externally and the configured target internally. The current prototype rejects arbitrary cloud base URLs to avoid credential forwarding and supports only the documented default SDK endpoint. Verify other tenancies before adding them.

The image enables `NODE_USE_ENV_PROXY=1` at process startup and uses Node 24.11.1, which supports the documented [environment proxy mechanism](https://nodejs.org/learn/http/enterprise-network-configuration). Set `HTTPS_PROXY`, optionally `HTTP_PROXY`, and `NO_PROXY`. Test the actual SDK with your proxy; basic package behavior has been inspected, but proxy behavior is unverified. The local Node 24.3 runtime was used only for offline tests, not proxy verification.

Target requests deliberately use a dedicated direct connection (`agent:false`), bypassing global proxies. This prevents accidentally forwarding private target credentials through corporate egress. A target accessible only through a proxy needs an explicitly reviewed adapter enhancement; do not assume proxy variables apply to that path.

Mount a PEM trust bundle read-only and set `NODE_EXTRA_CA_CERTS=/certs/corporate.pem` before startup for SDK TLS interception. Use `target.caFile` for a target-specific bundle; when set it replaces default target trust, so include required issuers. TLS verification remains mandatory; `NODE_TLS_REJECT_UNAUTHORIZED=0` is rejected. No insecure switch is provided. Mutual TLS, proxy authentication workflows and target proxy routing need further validation/implementation.

## Standalone Kubernetes

In a cluster, launch the runner as a Job. Kubernetes provides networking; there is no `CUSTOMER_PRIVATE_NETWORK` or Docker `--network` value to carry over. For example, a target Service named `chatbot` in namespace `apps` on port 8000 is reachable at `http://chatbot.apps.svc.cluster.local:8000/v1/chat/completions` on clusters using the default `cluster.local` domain. See [Kubernetes Service DNS](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/).

Before starting: publish the Red image to your cluster's registry and update `image` in `deploy/kubernetes/job.yaml` to that pullable image (with the appropriate CPU architecture and any image-pull credentials). A laptop-local Docker image is not automatically available to cluster nodes. Prepare `runner.cluster.json` with the Service URL, actual model, existing target/objective IDs, `/results` output and `allowHttp:true` only if using HTTP. Use HTTPS and the appropriate trust configuration when the application serves TLS.

The following example uses a dedicated namespace `red-scans`. It assumes a storage provisioner and a Secret named `red-runner` already provisioned in that namespace by your secret manager, with keys `red-api-key` and `target-api-key`. The target Service must already exist. Configure network policy to permit DNS, the target and approved Red HTTPS/proxy egress before starting the Job; the supplied deny-all template alone will block execution.

```sh
kubectl create namespace red-scans
# Provision the red-runner Secret in red-scans through your secret manager.
kubectl -n red-scans create configmap red-runner --from-file=runner.json=./runner.cluster.json
kubectl -n red-scans apply -f deploy/kubernetes/pvc.yaml
# First customize this policy with your approved egress rules.
kubectl -n red-scans apply -f deploy/kubernetes/network-policy.yaml
# First set job.yaml's image to your published registry image.
kubectl -n red-scans apply -f deploy/kubernetes/job.yaml
kubectl -n red-scans logs -f job/red-runner
kubectl -n red-scans get job red-runner
```

This is a first-run example; namespace/config creation is done once. For subsequent scans, use a new Job name and matching configuration rather than expecting `kubectl apply` to rerun a completed Job. No Kubernetes API token or RBAC is needed inside the runner. Cluster execution remains unverified here.

The supplied NetworkPolicy denies all ingress and egress by default and will block scans until your approved egress rules are added. Standard NetworkPolicy cannot allow an FQDN directly. Prefer an egress gateway/proxy with a hostname allowlist, or an FQDN-aware CNI policy; do not freeze cloud IPs without an update process. Enforcement depends on the cluster CNI. No Service/Ingress is required for the runner.

Pods run as 10001, drop capabilities, disallow privilege escalation, use RuntimeDefault seccomp, a read-only root and CPU/memory limits. `fsGroup` prepares compatible PVC permissions, but volume drivers differ. Reports themselves remain private to the runner UID. Configure encrypted storage, capacity, access and retention. ReadWriteOnce supports the example single scheduled runner; concurrent jobs on different nodes may need RWX or separate claims. UUID directories handle naming collisions, not storage scheduling.

The pod deadline must accommodate the default 1800-second target setup/recon budget plus the 3600-second assessment budget and report publication. Increase the pod deadline to exceed the sum of `red.recon.timeoutSeconds` and `execution.timeoutSeconds` when changing either budget. Do not use a liveness probe that restarts assessments. Kubernetes marks exit 1 as Failed even when findings are an expected assessment outcome; inspect the report/exit code instead of treating every failed Job as an infrastructure fault. Collect artifacts before TTL cleanup if using ephemeral storage; the PVC persists.

## Helm

The chart references existing config, secret and results PVC; it does not duplicate their sensitive content. Apply your namespace network policy separately.

```sh
helm lint deploy/helm/red-runner
helm template assessment deploy/helm/red-runner
helm install assessment deploy/helm/red-runner --set image=checkpoint-red-runner:0.1.0
helm install nightly deploy/helm/red-runner --set 'schedule=0 2 * * *'
```

Empty schedule renders a Job; populated schedule renders a CronJob with Forbid overlap. Use distinct releases deliberately; Forbid does not coordinate separate CronJobs. Job templates are immutable: use a new release/run name or remove a finished Job before changing its spec. `extraEnv`, `extraVolumes` and `extraVolumeMounts` support read-only CA mounts and proxy settings; these are trusted administrator values.

## CI and scheduling

See `.github/workflows/local.yml` for credential-free testing. For a private assessment, use a self-hosted CI worker inside the authorized network, the Red image, and secret injection. Preserve the container exit code, always collect reports, verify the UUID manifest, then apply the configurable gate. Never choose an arbitrary latest directory from a shared mount.

Use `node scripts/consume.mjs <report-directory> red` for the production gate, so a mock configuration cannot be mistaken for a real assessment. If no receipt or manifest exists, fail the pipeline as incomplete. Upload raw transcripts only under an explicit sensitive-data retention policy.

An external scheduler may launch the same command; no daemon or database is required. Red UI central scheduling/runner work retrieval is future work, not implemented here.
