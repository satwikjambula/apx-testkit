#!/usr/bin/env node
import { planTestSelection } from './selection.js';

const args = process.argv.slice(2);
if (args.length !== 2 || args.some(arg => arg.startsWith('-'))) {
  console.error('Usage: apx-select <baseline-export-dir> <current-export-dir>');
  console.error('Print an advisory JSON impact plan. Does not execute or skip tests.');
  process.exitCode = 2;
} else {
  try {
    console.log(JSON.stringify(planTestSelection(args[0]!, args[1]!), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
