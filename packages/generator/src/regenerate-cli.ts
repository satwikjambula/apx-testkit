#!/usr/bin/env node
import { applyRegeneration, previewRegeneration } from './regenerate.js';

const args = process.argv.slice(2);
if (![3, 5].includes(args.length) || !args[0] || args[0].startsWith('-') || args[1] !== '--out' || !args[2] || args[2].startsWith('-') || (args.length === 5 && (args[3] !== '--apply' || !/^sha256:[a-f0-9]{64}$/.test(args[4]!)))) {
  console.error('Usage: apx-regenerate <export-dir> --out <tests-dir> [--apply sha256:<preview-plan-hash>]');
  process.exitCode = 2;
} else {
  try {
    const result = args[4] ? applyRegeneration(args[0]!, args[2]!, args[4]) : previewRegeneration(args[0]!, args[2]!);
    console.log(JSON.stringify(result, null, 2));
    if ('conflicts' in result && result.conflicts.length) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
