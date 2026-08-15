import { describe, expect, it } from 'vitest';
import { assessNavigationSafety, gotoApexPageAuto, navigateViaUiPath } from '../src/fixtures/navigation.js';

describe('assessNavigationSafety', () => {
  it('flags a non-public page with argumentsMustHaveChecksum as unsafe -- the directly live-confirmed case', () => {
    // Mirrors Sample Interactive Grids' Home/Basic Editing pages exactly
    // (docs/quirks/26.1.json `page-access-protection-blocks-bare-navigation`).
    const result = assessNavigationSafety({ pageAccessProtection: 'argumentsMustHaveChecksum', isPublic: false });
    expect(result.mode).toBe('ui-navigation');
    expect(result.reason).toMatch(/argumentsMustHaveChecksum/);
    expect(result.reason).toMatch(/page-access-protection-blocks-bare-navigation/);
  });

  it('treats a PUBLIC page with argumentsMustHaveChecksum as safe -- the inferred case (UX Pattern Catalog pattern)', () => {
    // Mirrors UX Pattern Catalog's p00420 (public, checksum-protected,
    // but returns a page-level 400, not a /login redirect).
    const result = assessNavigationSafety({ pageAccessProtection: 'argumentsMustHaveChecksum', isPublic: true });
    expect(result.mode).toBe('direct-url');
  });

  it('treats a non-public page WITHOUT the checksum flag as safe', () => {
    const result = assessNavigationSafety({ pageAccessProtection: null, isPublic: false });
    expect(result.mode).toBe('direct-url');
  });

  it('treats an ordinary public page as safe', () => {
    const result = assessNavigationSafety({ pageAccessProtection: null, isPublic: true });
    expect(result.mode).toBe('direct-url');
  });

  it('does not match a differently-named protection value -- only the exact confirmed string triggers unsafe', () => {
    const result = assessNavigationSafety({ pageAccessProtection: 'someOtherFutureValue', isPublic: false });
    expect(result.mode).toBe('direct-url');
  });
});

describe('gotoApexPageAuto', () => {
  it('throws a specific, actionable error instead of attempting a bare goto when unsafe', async () => {
    const safety = assessNavigationSafety({ pageAccessProtection: 'argumentsMustHaveChecksum', isPublic: false });
    const fakePage = {} as any; // never touched -- the function must fail before using it
    await expect(gotoApexPageAuto(fakePage, 'https://host/app/basic-editing', safety)).rejects.toThrow(
      /NOT safe.*navigateViaUiPath/s,
    );
  });
});

describe('navigateViaUiPath', () => {
  it('throws immediately if given zero steps, without touching the page at all', async () => {
    const fakePage = {} as any;
    await expect(navigateViaUiPath(fakePage, [])).rejects.toThrow(/no steps supplied/);
  });
});
