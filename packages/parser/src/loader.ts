import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { ApexlangManifest } from './ast.js';

export interface LoadedApexlangExport {
  manifest: ApexlangManifest | null;
  sources: Record<string, string>;
  /** Parsed non-manifest JSON metadata such as deployments/default.json. */
  metadata: Record<string, unknown>;
  warnings: string[];
}

export interface LoadApexlangExportOptions {
  unsupportedVersion?: 'error' | 'warn';
  /**
   * Permit a directory without `.apex/apexlang.json`. Intended only for
   * deliberately partial/synthetic inputs whose APEX version is established
   * by the caller. Full-export consumers should retain the fail-closed default.
   */
  allowMissingManifest?: boolean;
}

function relativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function walk(root: string, dir: string, files: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(root, path, files);
    else if (entry.isFile()) files.push(relativePath(root, path));
  }
}

function parseJson(path: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Deterministically load every APEXlang source plus export metadata. */
export function loadApexlangExport(
  exportDir: string,
  options: LoadApexlangExportOptions = {},
): LoadedApexlangExport {
  const root = resolve(exportDir);
  const paths: string[] = [];
  walk(root, root, paths);

  const sources: Record<string, string> = {};
  const metadata: Record<string, unknown> = {};
  let manifest: ApexlangManifest | null = null;
  const warnings: string[] = [];

  for (const path of paths) {
    if (path.endsWith('.apx')) {
      sources[path] = readFileSync(join(root, path), 'utf8');
      continue;
    }
    if (path === '.apex/apexlang.json') {
      const text = readFileSync(join(root, path), 'utf8');
      const parsed = parseJson(path, text);
      if (!parsed || typeof parsed !== 'object' || typeof (parsed as { mmdVersion?: unknown }).mmdVersion !== 'string') {
        throw new Error(`${path}: required string property 'mmdVersion' is missing.`);
      }
      manifest = { mmdVersion: (parsed as { mmdVersion: string }).mmdVersion };
      continue;
    }
    if (path.startsWith('deployments/') && path.endsWith('.json')) {
      metadata[path] = parseJson(path, readFileSync(join(root, path), 'utf8'));
    }
  }

  if (manifest && !/^26\.1(?:\.|$)/.test(manifest.mmdVersion)) {
    const message =
      `.apex/apexlang.json declares mmdVersion '${manifest.mmdVersion}', but this parser is verified only for APEX 26.1 exports.`;
    if ((options.unsupportedVersion ?? 'error') === 'error') throw new Error(message);
    warnings.push(message);
  }
  if (!manifest && !options.allowMissingManifest) {
    throw new Error(
      ".apex/apexlang.json is missing; cannot verify that this is an APEX 26.1 export. " +
        'Pass { allowMissingManifest: true } only for an intentionally partial or synthetic input.',
    );
  }

  return { manifest, sources, metadata, warnings };
}
