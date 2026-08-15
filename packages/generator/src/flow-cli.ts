#!/usr/bin/env node
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeFlowMap } from './flow.js';

const args = process.argv.slice(2);
const dir = args[0];
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : './flow-map.json';

if (!dir || dir.startsWith('--')) {
  console.error('Usage: apx-flow <export-dir> [--out <flow-map.json>]');
  console.error('  <export-dir> must contain a pages/ subdirectory; application.apx is read when present.');
  console.error('  Builds a deterministic navigation graph (nodes = pages, edges = branch/');
  console.error('  region-action/report-column-link/button navigation targets) directly from');
  console.error('  the already-typed AST -- pure read, no live app or browser needed.');
  console.error('  Writes the graph as JSON to --out (default ./flow-map.json).');
  process.exit(2);
}
if (outIdx >= 0 && !out) {
  console.error('--out requires an output path, e.g. --out flow-map.json');
  process.exit(2);
}
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`Export directory not found: ${dir}`);
  process.exit(2);
}
if (!existsSync(join(dir, 'pages'))) {
  console.error(`No pages/ subdirectory in ${dir} — is this an unzipped APEXlang export root?`);
  process.exit(2);
}

const flowMap = computeFlowMap(dir);

const bySource: Record<string, number> = {};
const byConfidence: Record<string, number> = {};
for (const e of flowMap.edges) {
  bySource[e.source] = (bySource[e.source] ?? 0) + 1;
  byConfidence[e.confidence] = (byConfidence[e.confidence] ?? 0) + 1;
}

console.log(`Flow Map`);
console.log(`  nodes (pages): ${flowMap.nodes.length}`);
console.log(`  edges: ${flowMap.edges.length}`);
for (const [source, count] of Object.entries(bySource).sort()) {
  console.log(`    ${source}: ${count}`);
}
console.log(`  confidence:`);
for (const [confidence, count] of Object.entries(byConfidence).sort()) {
  console.log(`    ${confidence}: ${count}`);
}
if (flowMap.reachability.pagesWithNoIncomingEdges.length > 0) {
  console.log(
    `  pages with no incoming edge from these 4 sources: ${flowMap.reachability.pagesWithNoIncomingEdges.join(', ')}`,
  );
  console.log(
    `    (not a claim these pages are unreachable in the running app -- breadcrumbs, navigation lists,`,
  );
  console.log(`     apex.navigation, and Dynamic Action redirects are all out of this pass's scope)`);
}

writeFileSync(out, JSON.stringify(flowMap, null, 2));
console.log(`\nFlow Map written to ${out}`);
