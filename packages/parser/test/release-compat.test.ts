import { describe, expect, it } from 'vitest';
import { parseApp, supportedApexRelease, apexReleaseOf } from '../src/index.js';
import type { LoadedApexlangExport } from '../src/index.js';

/**
 * Evidence for the 26.2 behaviours below: oracle/apex's `26.1` and `26.2`
 * branches, the same 33 sample apps, 1,490 pages paired by app + page number
 * (see docs/grammar-assumptions.md "APEX 26.2 compatibility"). Fixtures here
 * are small synthetic pages shaped like those exports.
 */
const page = (id: number, security: string): string => `page ${id} (
    name: Page ${id}
    alias: PAGE-${id}
${security}
)`;

const loaded = (mmdVersion: string | null, sources: Record<string, string>): LoadedApexlangExport => ({
  manifest: mmdVersion ? { mmdVersion } : null,
  sources,
  metadata: {},
  warnings: [],
});

const SECURITY_AUTH_ONLY = `    security {
        authentication: required
    }`;

describe('release helpers', () => {
  it('extracts the release from a full build string and rejects non-matching shapes', () => {
    expect(apexReleaseOf('26.2.0+3479')).toBe('26.2');
    expect(apexReleaseOf('26.1.0+3102')).toBe('26.1');
    expect(apexReleaseOf('v26.2')).toBeNull();
    expect(apexReleaseOf('26')).toBeNull();
    expect(supportedApexRelease('26.2.0+3479')).toBe('26.2');
    expect(supportedApexRelease('26.3.0')).toBeNull();
  });
});

describe('omitted security.pageAccessProtection is release-dependent', () => {
  const sources = {
    'pages/p00000-global-page.apx': `page 0 (\n    name: Global Page\n)`,
    'pages/p00001-home.apx': page(1, SECURITY_AUTH_ONLY),
    'pages/p00002-open.apx': page(2, `    security {\n        authentication: required\n        pageAccessProtection: unrestricted\n    }`),
    'pages/p00003-noargs.apx': page(3, `    security {\n        pageAccessProtection: noArgumentsSupported\n    }`),
    'pages/p00004-no-security-group.apx': page(4, ''),
  };
  const byId = (r: ReturnType<typeof parseApp>, id: number) => r.ast.pages.find((p) => p.id === id)!;

  it('26.2: an omitted value resolves to argumentsMustHaveChecksum and is flagged as defaulted', () => {
    const r = parseApp(loaded('26.2.0+3479', sources));
    expect(byId(r, 1)).toMatchObject({ pageAccessProtection: 'argumentsMustHaveChecksum', pageAccessProtectionDefaulted: true });
    expect(byId(r, 4)).toMatchObject({ pageAccessProtection: 'argumentsMustHaveChecksum', pageAccessProtectionDefaulted: true });
  });

  it('26.2: explicit values are never overridden and are not flagged', () => {
    const r = parseApp(loaded('26.2.0+3479', sources));
    expect(byId(r, 2)).toMatchObject({ pageAccessProtection: 'unrestricted', pageAccessProtectionDefaulted: false });
    expect(byId(r, 3)).toMatchObject({ pageAccessProtection: 'noArgumentsSupported', pageAccessProtectionDefaulted: false });
  });

  it('26.2: page 0 (Global Page) is never defaulted -- the property does not apply there', () => {
    const r = parseApp(loaded('26.2.0+3479', sources));
    expect(byId(r, 0)).toMatchObject({ pageAccessProtection: null, pageAccessProtectionDefaulted: false });
  });

  it('26.2: the value as written stays untouched in raw', () => {
    const r = parseApp(loaded('26.2.0+3479', sources));
    expect(byId(r, 1).raw['security.pageAccessProtection']).toBeUndefined();
  });

  it('26.1: behaviour is unchanged -- an omitted value stays null, never guessed', () => {
    const r = parseApp(loaded('26.1.0+3102', sources));
    for (const id of [0, 1, 4]) expect(byId(r, id)).toMatchObject({ pageAccessProtection: null, pageAccessProtectionDefaulted: false });
    expect(byId(r, 2).pageAccessProtection).toBe('unrestricted');
  });

  it('no manifest (partial or synthetic input): the release is unknown, so nothing is defaulted', () => {
    const r = parseApp(sources);
    for (const id of [0, 1, 4]) expect(byId(r, id)).toMatchObject({ pageAccessProtection: null, pageAccessProtectionDefaulted: false });
  });
});

describe('raw TAB inside a quoted string (present in real 26.1 and 26.2 Oracle exports)', () => {
  // oracle/apex universal-theme-reference pages/p00300-grid-layout.apx writes
  // `"u-textCenter<TAB>"` literally, on both the 26.1 and 26.2 branches.
  it('decodes the TAB and raises no warning', () => {
    const r = parseApp({ 'p.apx': `page 5 (\n    name: "u-textCenter\t"\n)` });
    expect(r.warnings).toEqual([]);
    expect(r.ast.pages[0]!.name).toBe('u-textCenter\t');
  });

  it('still rejects any other raw control character explicitly', () => {
    const r = parseApp({ 'p.apx': `page 5 (\n    name: "bad\u0001value"\n)` });
    expect(r.warnings).toEqual([expect.objectContaining({ message: expect.stringMatching(/^Invalid quoted string/), severity: 'error' })]);
  });

  it('leaves already-valid escaped strings byte-for-byte unchanged', () => {
    const r = parseApp({ 'p.apx': `page 5 (\n    name: "a\\tb"\n)` });
    expect(r.warnings).toEqual([]);
    expect(r.ast.pages[0]!.name).toBe('a\tb');
  });
});
