#!/usr/bin/env node
import { planTestSelection } from './selection.js';
import { readFileSync } from 'node:fs';
import { evaluateSelectionContract } from './selection-contract.js';

const args = process.argv.slice(2);
const flags = new Map<string, string>();
let invalid = args.length < 2 || args.slice(0, 2).some(arg => arg.startsWith('-'));
for (let i = 2; i < args.length; i += 2) {
  const key = args[i]!;
  const value = args[i + 1];
  if (!['--contract', '--suite', '--context'].includes(key) || flags.has(key) || !value || value.startsWith('-')) invalid = true;
  else flags.set(key, value);
}
if (flags.size !== 0 && flags.size !== 3) invalid = true;
if (invalid) {
  console.error('Usage: apx-select <baseline-export-dir> <current-export-dir> [--contract contract.json --suite tests-dir --context external-state.json]');
  console.error('Print an advisory JSON impact plan. Does not execute or skip tests.');
  process.exitCode = 2;
} else {
  try {
    const plan = planTestSelection(args[0]!, args[1]!);
    const selection = flags.size ? evaluateSelectionContract(plan, JSON.parse(readFileSync(flags.get('--contract')!, 'utf8')), flags.get('--suite')!, flags.get('--context')!) : null;
    console.log(JSON.stringify(selection ? { ...plan, contractSelection: selection } : plan, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
