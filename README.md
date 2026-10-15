# china-network-reachability-benchmark

Measured, reproducible data on how reachable the global SaaS stack is from inside Mainland China.

> **Status: repo skeleton** — first data release ships the week of 2026-10-26, once the initial run + confirmation re-run are complete. Everything below is final except the data itself.

## What this is

A fixed panel of 35 global SaaS endpoints (fonts CDNs, analytics, payments, AI APIs, package registries, …), probed from live Mainland China carrier nodes (China Telecom / China Unicom / China Mobile) via Alibaba Cloud Monitor's instant site monitor. Every release is dated, runs twice a week apart, and ships raw per-node results.

Read the [methodology](./methodology.md) before quoting any number. The short version: reachability means an HTTP response arrived (404 counts); failures are DNS failures, timeouts, and connection resets; timing is reported as distributions.

## Contents

- [`methodology.md`](./methodology.md) — measurement semantics, classification rules, limitations
- [`endpoints.json`](./endpoints.json) — the probe panel (v1)
- [`data/`](./data/) — per-run `raw.json` + `summary.csv`, named by run timestamp
- [`collect.mjs`](./collect.mjs) — the runner (imports the same probe provider Chinaready runs in production)

## Re-run it

Anyone with an Alibaba Cloud account holding CloudMonitor permissions can reproduce a run:

```bash
export ALIYUN_CM_ACCESS_KEY_ID=…      # RAM user with cms:CreateInstantSiteMonitor
export ALIYUN_CM_ACCESS_KEY_SECRET=…
export ALIYUN_CM_REGION=cn-hangzhou
node collect.mjs --dry-run
node collect.mjs
```

Credentials never enter this repo; outputs are scrubbed of credential material.

## License

Data: CC BY 4.0. Code: MIT.

## Maintained by

[Chinaready](https://chinaready.co/) — China readiness assessment, acceleration, hosting, and app distribution. Report pages live at [chinaready.co/research](https://chinaready.co/research/).
