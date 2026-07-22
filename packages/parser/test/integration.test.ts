import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseApp } from '../src/index.js';

// Real 26.1 APEXlang export: UX Pattern Catalog (local ground truth; not committed).
const ROOT = process.env.APX_EXPORT_DIR ?? '/home/claude/upload-inspect';
import { existsSync } from 'node:fs';
const HAVE_EXPORT = existsSync(ROOT);

function loadAll(): Record<string, string> {
  const files: Record<string, string> = {};
  const add = (rel: string) => {
    files[rel] = readFileSync(join(ROOT, rel), 'utf8');
  };
  add('application.apx');
  add('page-groups.apx');
  for (const f of readdirSync(join(ROOT, 'pages'))) add(`pages/${f}`);
  for (const f of readdirSync(join(ROOT, 'shared-components')))
    if (f.endsWith('.apx')) add(`shared-components/${f}`);
  return files;
}

describe.skipIf(!HAVE_EXPORT)('integration: real UX Pattern Catalog export', () => {
  const result = parseApp(loadAll());

  it('parses every .apx file with zero warnings', () => {
    const sample = result.warnings.slice(0, 15).map((w) => `${w.loc.file}:${w.loc.line} ${w.message}`);
    expect(sample).toEqual([]);
  });

  it('finds all 19 pages with numeric ids and aliases', () => {
    expect(result.ast.pages.length).toBe(19);
    for (const p of result.ast.pages) {
      expect(Number.isInteger(p.id)).toBe(true);
      if (p.id !== 0) expect(p.alias).toBeTruthy(); // global page 0 has no alias in real exports
    }
  });

  it('attaches pageItems and buttons to regions via layout.region refs', () => {
    const p420 = result.ast.pages.find((p) => p.id === 420)!;
    expect(p420.items.length).toBeGreaterThan(3);
    const dept = p420.items.find((i) => i.identifier === 'P420_DEPARTMENT')!;
    expect(dept.type).toBe('selectList');
    expect(dept.label).toBe('Department');
    expect(dept.sourceColumn).toBe('DEPARTMENT');
    const attached = p420.regions.some((r) => r.items.some((i) => i.identifier === 'P420_DEPARTMENT'));
    expect(attached).toBe(true);
  });

  it('captures fenced code blocks (css/html/sql) as {lang, code}', () => {
    const p410 = result.ast.pages.find((p) => p.id === 410)!;
    const css = p410.raw['css.inline'] as { lang: string; code: string };
    expect(css.lang).toBe('css');
    expect(css.code).toContain('.app-Form');
  });

  it('deterministic across runs', () => {
    const again = parseApp(loadAll());
    expect(JSON.stringify(again.ast)).toBe(JSON.stringify(result.ast));
  });
});
