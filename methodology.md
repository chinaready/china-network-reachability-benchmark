# China Network Reachability Benchmark — Methodology (v1)

> Status: methodology frozen for the first run; collection pending CloudMonitor write permission (see README). Data and report will follow this document exactly.

## Purpose

Measure how reachable the global SaaS and third-party dependency stack is from inside Mainland China, from real Chinese carrier networks — replacing folklore ("X is blocked in China") with per-endpoint, per-node evidence. Output feeds the `/research/` section and the public dataset.

## Probe platform

- **Executor**: Alibaba Cloud Monitor (CMS) *instant site monitor* — one-shot HTTP detections dispatched from real Mainland China network nodes. This is the same provider that powers Chinaready Workbench diagnostics (`wb/lib/diagnostics/aliyun-cloudmonitor-provider.js`); the benchmark imports that provider directly, so there is exactly one probe implementation in production use.
- **Node panel**: resolved live at run time via `DescribeSiteMonitorISPCityList` (IPv4, 电信/移动/联通), preferring the provincial-capital template. Aliyun rotates nodes; no hard-coded city list is used.

## Endpoint panel

`endpoints.json` — 35 endpoints across 11 categories (fonts/CSS CDNs, analytics, maps, payments, identity, push/SMS/email, video/social embeds, AI APIs, developer infrastructure, cloud APIs, B2B productivity APIs). Selection criteria: dependencies that appear repeatedly in real client stacks; API hosts are probed at a representative path, not a login-protected one.

## Measurement semantics

- **Reachability, not application correctness.** For API hosts, ANY HTTP response (404/405 included) counts as *reached* — the cross-border path delivered a request and returned a response.
- **Failure** = DNS resolution failure, connection timeout, or connection reset from a node.
- **Per-endpoint classification**:
  - `available` — ≥90% of probe nodes got an HTTP response
  - `limited` — responses from some nodes only, or degraded (timing far off the global baseline)
  - `unavailable` — no (or near-no) node got a response
- **Timing**: per-node elapsed milliseconds from the probe log; reported as distribution (median / p90), not a single number.

## Known limitations

- Raw HTTP reachability only — no JS execution; a page that loads but renders blank is "reachable" here. Dependency-level breakage is what this benchmark isolates, which is the decision-relevant signal.
- GFW behavior varies by region, carrier, and time; single-run numbers are a snapshot. The planned cadence is an initial run plus a confirmation re-run within 7 days before publishing.
- Probe nodes are Aliyun's shared panel; ISP routing from consumer networks can differ.

## Output artifacts

Per run (`data/<run-id>/`): `raw.json` (per-node results, redacted of any credential material — the provider scrubs responses) and `summary.csv` (per-endpoint classification). Published artifacts (later, in the public repo): the panel, methodology, per-run CSV/JSON, and a dated report.

## Reproducibility

Anyone with an Aliyun account holding CMS permissions can re-run: `node collect.mjs` against the committed panel. Credentials are environment-only; nothing secret enters the repo.
