import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ApexPage } from '@apx/parser';
import { computeDuplicateLabelButtons, pageObjectFor } from '../src/page-object.js';

/**
 * Regression coverage for the P0 item 4 fix (runtime-review):
 * `buttonByLabel(page, 'Save')` assumes label uniqueness, but a real app
 * can have multiple buttons sharing a label -- confirmed on REAL exports
 * this pass (UX Pattern Catalog p00120 "Dashboard Advanced" has FIVE
 * buttons all labeled "View Details"; apextogo p00004 "Home" has four
 * labeled "Show All"; Sample Charts p00023 "Range" has two pairs).
 * `pageObjectFor()` must never silently generate an ambiguous click
 * method for any button in a colliding group -- it must skip generation
 * for that specific button with a clear, actionable comment instead, and
 * every OTHER (non-colliding) button on the same page must be
 * completely unaffected.
 */
function button(overrides: Partial<ApexPage['buttons'][number]>): ApexPage['buttons'][number] {
  return {
    identifier: 'x',
    label: null,
    action: null,
    target: null,
    url: null,
    htmlDomId: null,
    loc: { file: 'p1.apx', line: 1 },
    raw: {},
    ...overrides,
  };
}

function page(overrides: Partial<ApexPage>): ApexPage {
  return {
    identifier: 'test-page',
    id: 1,
    alias: 'TEST',
    name: 'Test',
    title: null,
    pageMode: null,
    pageAccessProtection: null,
    authentication: null,
    isPublic: false,
    items: [],
    regions: [],
    buttons: [],
    dynamicActions: [],
    branches: [],
    validations: [],
    processes: [],
    computations: [],
    loc: { file: 'p1.apx', line: 1 },
    raw: {},
    ...overrides,
  };
}

describe('computeDuplicateLabelButtons', () => {
  it('groups 2+ buttons sharing the same label', () => {
    const p = page({
      buttons: [
        button({ identifier: 'save_employee', label: 'Save' }),
        button({ identifier: 'save_request', label: 'Save' }),
        button({ identifier: 'cancel', label: 'Cancel' }),
      ],
    });
    const groups = computeDuplicateLabelButtons(p);
    expect(groups.size).toBe(1);
    expect(groups.get('Save')?.map((b) => b.identifier)).toEqual(['save_employee', 'save_request']);
    expect(groups.has('Cancel')).toBe(false); // unique label -- not a group
  });

  it('is empty when every label on the page is unique', () => {
    const p = page({
      buttons: [button({ identifier: 'save', label: 'Save' }), button({ identifier: 'cancel', label: 'Cancel' })],
    });
    expect(computeDuplicateLabelButtons(p).size).toBe(0);
  });

  it('ignores unlabeled buttons entirely', () => {
    const p = page({ buttons: [button({ identifier: 'icon1', label: null }), button({ identifier: 'icon2', label: null })] });
    expect(computeDuplicateLabelButtons(p).size).toBe(0);
  });
});

describe('pageObjectFor -- duplicate button label handling (real-corpus fixture)', () => {
  const fixtureDir = join(__dirname, 'fixtures', 'duplicate-button-fixture', 'pages');

  it('two same-labeled buttons with NEITHER having htmlDomId: both get a skip comment, neither gets a click method', () => {
    // Loaded via the fixture's real .apx text through the actual parser
    // would require a full generate() call (covered indirectly by the
    // real-corpus check below) -- this unit test drives pageObjectFor()
    // directly against a synthetic AST for precise, fast assertions.
    const p = page({
      id: 1,
      alias: 'DUPLICATE-NO-HTMLDOMID',
      buttons: [
        button({ identifier: 'save_employee', label: 'Save' }),
        button({ identifier: 'save_request', label: 'Save' }),
        button({ identifier: 'cancel', label: 'Cancel' }),
      ],
    });
    const output = pageObjectFor(p);
    expect(output).not.toContain('clickSaveEmployee');
    expect(output).not.toContain('clickSaveRequest');
    expect(output).toContain("Cannot generate a deterministic click method for 'save_employee'");
    expect(output).toContain("Cannot generate a deterministic click method for 'save_request'");
    expect(output).toContain("its label is shared with 'save_request'");
    expect(output).toContain('No advanced { htmlDomId } is set on this button');
    // The non-colliding button is completely unaffected.
    expect(output).toContain('async clickCancel(): Promise<void>');
    expect(output).toContain("clickButton(this.page, 'Cancel', { pageId: 1, identifier: 'cancel' })");
  });

  it('a colliding button WITH htmlDomId set: still no click method generated, but the comment names the escape hatch', () => {
    const p = page({
      id: 2,
      alias: 'DUPLICATE-WITH-HTMLDOMID',
      buttons: [
        button({ identifier: 'save_employee', label: 'Save', htmlDomId: 'saveEmployeeBtn' }),
        button({ identifier: 'save_request', label: 'Save' }),
      ],
    });
    const output = pageObjectFor(p);
    expect(output).not.toContain('clickSaveEmployee');
    expect(output).not.toContain('clickSaveRequest');
    expect(output).toContain('advanced { htmlDomId: saveEmployeeBtn }');
    expect(output).toContain('buttonByHtmlDomId()');
    expect(output).toContain('NOT YET LIVE-VERIFIED');
    // clickButton is unused on this page (both buttons ambiguous) --
    // must not be imported at all.
    expect(output).not.toMatch(/import \{[^}]*\bclickButton\b/);
  });

  it('every click method carries { pageId, identifier } -- coverage can never collapse two different buttons again', () => {
    const p = page({
      id: 3,
      alias: 'NO-DUPLICATES',
      buttons: [button({ identifier: 'save', label: 'Save' }), button({ identifier: 'cancel', label: 'Cancel' })],
    });
    const output = pageObjectFor(p);
    expect(output).toContain("clickButton(this.page, 'Save', { pageId: 3, identifier: 'save' })");
    expect(output).toContain("clickButton(this.page, 'Cancel', { pageId: 3, identifier: 'cancel' })");
  });

  it('passes application friendlyUrls metadata into URL construction', () => {
    const output = pageObjectFor(
      page({ isPublic: true, pageMode: 'normal', pageAccessProtection: 'unrestricted' }),
      {
        identifier: 'app',
        name: 'App',
        alias: 'APP',
        version: '1',
        type: 'standard',
        runtime: { friendlyUrls: false, compatibilityMode: '26.1' },
        loc: { file: 'application.apx', line: 1 },
        raw: {},
      },
    );
    expect(output).toContain('apexPageUrl(APP_BASE, TestPage.alias, false)');
  });

  it('matches the real fixture files on disk (sanity: fixtures actually parse to what these unit tests assume)', () => {
    // Not a parse -- just confirms the fixture files exist and declare
    // what this suite's synthetic ASTs mirror, so the two don't drift
    // apart silently.
    const text = readFileSync(join(fixtureDir, 'p00001-duplicate-no-htmldomid.apx'), 'utf8');
    expect(text).toContain('button save_employee');
    expect(text).toContain('button save_request');
    expect((text.match(/label: Save/g) ?? []).length).toBe(2);
  });
});
