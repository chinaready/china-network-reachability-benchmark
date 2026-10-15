#!/usr/bin/env node
// Copyright (c) 2026 Chinaready. All rights reserved.
// China Network Reachability Benchmark — collection runner.
//
// Drives the SAME Aliyun CloudMonitor instant-site-monitor provider the
// Workbench diagnostics module uses (imported from wb/lib/diagnostics, no
// copy) against the curated endpoint panel in endpoints.json. One HTTP
// probe per endpoint, dispatched to the live Mainland China 电信/移动/联通
// probe panel; results are written as JSON + CSV under data/<run-id>/.
//
// Credentials come from the environment ONLY (never argv, never the repo):
//   ALIYUN_CM_ACCESS_KEY_ID / ALIYUN_CM_ACCESS_KEY_SECRET / ALIYUN_CM_REGION
//
// The RAM user needs cms:CreateInstantSiteMonitor + cms:DescribeSiteMonitor*
// (the read-only `devopsapi` key will be rejected — see README.md).
//
// Usage:
//   node collect.mjs --dry-run          # list what would run, no probe calls
//   node collect.mjs --limit 3          # smoke-test the first N endpoints
//   node collect.mjs --only fonts_css   # one category
//   node collect.mjs                     # full panel
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AliyunCloudMonitorProvider } from '../../../wb/lib/diagnostics/aliyun-cloudmonitor-provider.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { dryRun: false, limit: 0, only: null, nodeSet: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]) || 0;
    else if (argv[i] === '--only') args.only = argv[++i];
    else if (argv[i] === '--node-set') args.nodeSet = argv[++i];
  }
  return args;
}

// Probe-node rotation: six regional groups of provincial-capital probe cities
// (city codes from the live panel catalog). Runs advance through the groups so
// that, after a full cycle, coverage spans the whole Mainland China panel.
export const NODE_SETS = [
  { name: 'north', label: 'North (Beijing · Tianjin · Shenyang · Harbin · Taiyuan · Langfang)', cities: ['738', '127', '116', '641', '558', '498'] },
  { name: 'east-core', label: 'East core (Shanghai · Hangzhou · Nanjing · Changzhou · Qingdao)', cities: ['357', '546', '718', '527', '572'] },
  { name: 'east-south', label: 'East-south (Fuzhou · Xiamen · Nanchang · Zhengzhou · Jinan · Hefei)', cities: ['414', '595', '226', '619', '690', '515'] },
  { name: 'central-southwest', label: 'Central & southwest (Wuhan · Changsha · Chongqing · Chengdu · Guiyang · Kunming)', cities: ['491', '421', '103', '301', '4', '765'] },
  { name: 'south', label: 'South (Guangzhou · Nanning · Liuzhou · Haikou)', cities: ['777', '532', '247', '345'] },
  { name: 'northwest', label: 'Northwest (Xi’an · Lanzhou · Xining · Urumqi · Yinchuan · Zhongwei)', cities: ['311', '50', '239', '598', '111', '776'] },
];

function resolveNodeSet(args) {
  const stateFile = join(HERE, 'data', 'node-rotation.json');
  let state = { nextSet: 0 };
  try {
    state = JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    // first run — start at group 0
  }
  let index;
  if (args.nodeSet) {
    index = NODE_SETS.findIndex((set) => set.name === args.nodeSet);
    if (index === -1) {
      console.error(`Unknown --node-set "${args.nodeSet}". Options: ${NODE_SETS.map((s) => s.name).join(', ')}`);
      process.exit(2);
    }
  } else {
    index = state.nextSet % NODE_SETS.length;
  }
  const next = { nextSet: (index + 1) % NODE_SETS.length };
  mkdirSync(join(HERE, 'data'), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(next, null, 2));
  return NODE_SETS[index];
}

function toCsv(run) {
  const header = 'endpoint_id,category,label,url,nodes_probed,nodes_responded,availability_pct,aggregate_status';
  const rows = run.results.map((r) => {
    const pct = r.availabilityRate ?? 0;
    return [r.id, r.category, `"${r.label}"`, r.url, r.nodeCount, r.respondedCount, pct, r.status].join(',');
  });
  return [header, ...rows].join('\n') + '\n';
}

const args = parseArgs(process.argv.slice(2));
const panel = JSON.parse(readFileSync(join(HERE, 'endpoints.json'), 'utf8'));
let endpoints = panel.endpoints;
if (args.only) endpoints = endpoints.filter((e) => e.category === args.only);
if (args.limit > 0) endpoints = endpoints.slice(0, args.limit);

if (!process.env.ALIYUN_CM_ACCESS_KEY_ID && !args.dryRun) {
  console.error('Missing ALIYUN_CM_ACCESS_KEY_ID / ALIYUN_CM_ACCESS_KEY_SECRET in the environment.');
  console.error('See README.md — the key must hold cms:CreateInstantSiteMonitor permission.');
  process.exit(2);
}

if (args.dryRun) {
  const set = resolveNodeSet({ ...args, nodeSet: null });
  console.log(`dry-run: ${endpoints.length} endpoint(s) would be probed (HTTP, node group: ${set.label})`);
  for (const e of endpoints) console.log(`  [${e.category}] ${e.label} — ${e.url}`);
  process.exit(0);
}

const nodeSet = resolveNodeSet(args);
process.env.ALIYUN_CM_CITY_FILTER = nodeSet.cities.join(',');
console.log(`node group: ${nodeSet.label}`);
const provider = new AliyunCloudMonitorProvider({ ...process.env });
const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(HERE, 'data', runId);
mkdirSync(outDir, { recursive: true });

const run = {
  runId,
  startedAt: new Date().toISOString(),
  panelVersion: panel.version,
  nodeSet: { name: nodeSet.name, label: nodeSet.label, cities: nodeSet.cities },
  results: [],
};
for (const [i, endpoint] of endpoints.entries()) {
  process.stdout.write(`[${i + 1}/${endpoints.length}] ${endpoint.label} … `);
  const probe = await provider.runProbe({ type: 'http', target: endpoint.url });
  const nodes = probe.nodeResults || [];
  const stats = probe.resultStats ?? null;
  const nodeCount = stats?.totalNodes ?? nodes.length ?? 0;
  // Per-node shape (provider aggregate.details): { city, isp, available, latency, error … }
  const respondedCount = nodes.filter((n) => n.available === true || n.httpStatus != null || n.success).length;
  const rate = stats?.availabilityRate ?? (nodeCount ? (respondedCount / nodeCount) * 100 : 0);
  const status =
    probe.status !== 'completed' && probe.status !== 'ok'
      ? 'failed'
      : rate >= 90
        ? 'available'
        : rate > 0
          ? 'limited'
          : 'unavailable';
  run.results.push({
    ...endpoint,
    status,
    nodeCount,
    respondedCount,
    availabilityRate: Math.round(rate * 10) / 10,
    summary: probe.summary,
    stats,
    nodes: nodes.map((n) => ({
      city: n.city ?? n.cityName ?? null,
      isp: n.isp ?? n.operator ?? null,
      available: n.available ?? null,
      httpStatus: n.httpStatus ?? n.statusCode ?? null,
      elapsedMs: n.elapsedMs ?? n.totalMs ?? n.latency ?? n.responseTime ?? null,
      error: n.errorMessage ?? n.error ?? null,
    })),
  });
  console.log(`${status} (${respondedCount}/${nodeCount} nodes, ${Math.round(rate)}%)`);
  writeFileSync(join(outDir, 'raw.json'), JSON.stringify(run, null, 2));
}
run.finishedAt = new Date().toISOString();
writeFileSync(join(outDir, 'raw.json'), JSON.stringify(run, null, 2));
writeFileSync(join(outDir, 'summary.csv'), toCsv(run));
console.log(`\nrun ${runId}: ${run.results.length} endpoints → ${outDir}`);
