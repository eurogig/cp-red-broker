# Bring Red assessments to private AI

Enterprises can assess internal AI applications without publishing endpoints or opening reverse tunnels. A customer-hosted runner forwards Red attacks to private services, returns responses for central evaluation, and exports outcomes for delivery pipelines. Security teams keep Red as their central assessment platform.

Run the same image as an ephemeral Docker container, Kubernetes Job, scheduled CronJob or CI task. The runner initiates HTTPS to Red; only the customer network needs access to the target. No database, separate distributed broker service or inbound runner service is required; the local process brokers each assessment session.

## Customer experience and limitations

Maintain target profiles and saved objectives in Red; reference their IDs locally. The runner stores private connectivity, secret references, limits and output settings. No complete versioned UI assessment-policy retrieval interface was identified, so objective selection and strategy remain a small local configuration.

Direct testing uses ordinary conversational endpoints. Indirect tool-response poisoning needs target-side SDK instrumentation, session correlation and sandboxed tools. Application responses and optional tool events leave the customer boundary; outbound-only is not fully local evaluation.

This prototype's local lifecycle, synthetic findings, gates and report publication are tested. The published SDK, live integration, containers and enterprise networking remain unverified due to environmental restrictions. Indirect runs cannot pass CI until delivery evidence is established. This is not a production-ready security assessment product.

## Next platform investments

Prioritize versioned read-only assessment policies, explicit terminal/cancel/delivery status, idempotent scan creation and bounded result retrieval. Later, introduce registered runner identities, scoped credentials and outbound claim/lease/heartbeat/resume. Central scheduling can then route assessments across private environments without inbound connectivity. Do not construct that control plane inside this runner first.
