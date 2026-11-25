# Results and consumption

Runs use UUID directories (0700) and files (0600). Mount ownership is trusted. Use the same UID or an explicit ACL/copy policy for consumers; do not make volumes world-writable. Concurrent runs never share filenames.

Files are exclusively created and fsynced. `manifest.json` is atomically renamed into place last, followed by directory fsync. This requires POSIX-like rename/fsync behavior; verify your storage driver. A missing manifest means no trustworthy terminal report, including crashes/OOM/SIGKILL. stdout contains one JSON receipt naming this run's directory.

| File | Content |
| --- | --- |
| `summary.json` | Schema version, UUID, provider, times, optional scan ID, sessions, gate, outcome/counts and objective verdicts |
| `junit.xml` | Raw attack verdicts; successes are failures, incompleteness is an error |
| `native-results.json` | Opt-in sensitive `getResults()` JSON snapshot |
| `manifest.json` | Terminal local receipt and SHA-256 artifact hashes |

The optional snapshot is not claimed byte-equivalent to SDK `writeResults`. Default exports omit response/error/explanation text, but identifiers remain potentially sensitive metadata. Never render raw reports as trusted HTML or execute their content. SARIF is omitted because these behavior findings have no reliable code locations or calibrated severity. Normalized JSON is suitable for dashboard/vulnerability-management importers without inventing source locations.

Coarse `failureCode` values distinguish missing SDK, missing Red credential, target failures, worker failures and deadlines/signals without exporting raw error messages. Evaluation incompleteness may have no failure code; inspect entry statuses and the overall outcome. Each artifact is capped at 25 MiB before any artifact is written.

## Outcome versus gate

- **0:** completed, successes within `gate.maxSuccessfulAttacks` (default zero).
- **1:** completed, tolerance exceeded.
- **2:** incomplete or failed assessment/configuration/export.

`outcome` independently says `clean`, `findings` or `incomplete`. A tolerant gate can return 0 with findings. **JUnit reports actual attacks, not tolerance policy**; automatic JUnit-based pipeline failures can be stricter than the CLI. Use verified `summary.exitCode` for configurable gating.

Unready/empty/malformed results, missing boolean verdicts, target errors, missing selected objectives, handler failures, deadlines and unverified indirect coverage all fail closed. Positive results remain useful even when overall execution is incomplete. Exact probe coverage and scan/target binding still depend on the uninspected SDK's authoritative completion semantics.

```sh
node scripts/consume.mjs /mounted/results/<run-id>
```

The consumer requires a final manifest, filename allowlist, regular bounded files, matching hashes, identity, outcome and schema. Missing/corrupt data returns 2. Use the UUID from that job's receipt rather than selecting a “latest” directory across concurrent runs.

For real assessment pipelines require the provider explicitly: `node scripts/consume.mjs /mounted/results/<run-id> red`. This rejects synthetic/mock receipts even when their gate passes.

Checksums detect corruption, not replacement by a writer who can change both manifest and reports. For authenticity, sign the manifest externally using CI identity or upload to immutable access-controlled storage. Configure encryption and retention. Sensitive snapshots require `output.includeSensitive:true`; default summaries are not an anonymization guarantee.
