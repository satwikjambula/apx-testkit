/**
 * SPIKE: metadata -> DOM verification for the whole project thesis.
 *
 * GENERATED FROM AST of pages/p00410-data-entry-simple-form.apx
 * (UX Pattern Catalog export, 26.1.0+3102). Every identifier below came out
 * of the parser, not out of a browser — that is the point. This spec exists
 * to answer four questions with one run:
 *
 *   Q1  Does the friendly URL derive from the page alias as assumed
 *       (DATA-ENTRY-SIMPLE-FORM -> /data-entry-simple-form)?
 *   Q2  How do .apx region identifiers appear in the rendered DOM
 *       (verbatim id? prefixed? data-attribute? only via apex.region())?
 *       -> the "region mapping probe" test DISCOVERS the convention and
 *          prints it; it fails only if NO convention matches.
 *   Q3  Do .apx pageItem identifiers map to apex.item() handles that can
 *       round-trip a value under Playwright's evaluate()?
 *   Q4  Is the console clean on load (the guard every generated smoke test
 *       will rely on)?
 *
 * Expected outcome of the FIRST run: some probes fail informatively.
 * Whatever convention Q2 reports becomes a verified fact in
 * docs/grammar-assumptions.md and the contract the real generator emits.
 */
import { expect, test, type Page } from '@playwright/test';
import { APP_BASE } from '../playwright.config.js';

/** Join app base + page path SAFELY. A leading '/' in page.goto() resolves
 *  against the HOST ROOT and silently discards the /ords/r/... prefix —
 *  the bug that 404'd the first run of this spike. Always build absolute. */
const pageUrl = (p: string) => `${APP_BASE.replace(/\/+$/, '')}/${p.replace(/^\/+/, '')}`;

/* ---------- constants emitted from the AST ---------- */
const PAGE = {
  alias: 'DATA-ENTRY-SIMPLE-FORM',
  path: 'data-entry-simple-form', // Q1 assumption: lowercased alias (no leading slash — see pageUrl)
  title: 'Data Entry – Simple Form', // note: en dash, straight from .apx
  regions: [
    'basic-fields-container',
    'buttons-container_1',
    'data-entry-simple-form',
    'form',
    'organization',
  ],
  visibleItems: [
    { id: 'P410_NAME', type: 'textField' },
    { id: 'P410_EMAIL', type: 'textField' },
    { id: 'P410_NOTES', type: 'textarea' },
    { id: 'P410_SALARY', type: 'numberField' },
    { id: 'P410_JOB', type: 'selectList' },
  ],
  hiddenItems: ['P410_ID'],
  buttons: [
    { id: 'apply', name: 'PRIMARY_ACTION', label: 'Primary Action' },
    { id: 'cancel', name: 'BACK', label: 'Back' },
    { id: 'cancel_1', name: 'CANCEL', label: 'Cancel' },
  ],
} as const;

/* ---------- console guard (prototype of the M2 fixture) ---------- */
function armConsoleGuard(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function gotoPage(page: Page): Promise<string[]> {
  const errors = armConsoleGuard(page);
  const url = pageUrl(PAGE.path);
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
  const status = resp?.status();
  expect(
    resp?.ok(),
    `Q1: GET ${url} -> ${status}, landed on ${page.url()} (alias->URL rule)`,
  ).toBe(true);
  // APEX finishes wiring after load; wait for the client API to exist.
  await page.waitForFunction(() => typeof (window as any).apex?.item === 'function');
  return errors;
}

test.describe('p410 spike (generated from .apx AST)', () => {
  test('Q0: diagnostics — ALWAYS prints, never depends on gotoPage', async ({ page }) => {
    // Purpose: guarantee the next failure report contains information.
    // Soft assertions only; read the DIAGNOSTICS block regardless of color.
    const url = pageUrl(PAGE.path);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded' }).catch((e) => {
      console.log('DIAGNOSTICS: goto threw:', String(e));
      return null;
    });
    const apexReady = await page
      .waitForFunction(() => typeof (window as any).apex?.item === 'function', undefined, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    const info = {
      requested: url,
      status: resp?.status() ?? null,
      landedOn: page.url(),
      title: await page.title().catch(() => null),
      apexGlobalReady: apexReady,
      looksLikeLogin: await page
        .evaluate(() => !!document.querySelector('#P9999_USERNAME, [name="p_t01"], .t-Login-region'))
        .catch(() => null),
      bodySnippet: (await page.evaluate(() => document.body?.innerText.slice(0, 300)).catch(() => '')) ?? '',
    };
    console.log('DIAGNOSTICS:', JSON.stringify(info, null, 2));
    expect.soft(info.status, 'expected 2xx').toBeLessThan(400);
    expect.soft(info.apexGlobalReady, 'apex JS API should boot').toBe(true);
  });

  test('Q1: title matches after Unicode normalization (raw equality is a generator anti-pattern)', async ({ page }) => {
    await gotoPage(page);
    const norm = (s: string) =>
      s.normalize('NFKC').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\s\u00A0]+/g, ' ').trim();
    const actual = await page.title();
    if (actual !== PAGE.title) {
      const codes = (s: string) => [...s].map((c) => c.codePointAt(0)!.toString(16)).join(' ');
      console.log('TITLE CODEPOINTS expected:', codes(PAGE.title));
      console.log('TITLE CODEPOINTS actual  :', codes(actual));
    }
    expect(norm(actual)).toBe(norm(PAGE.title));
  });

  test('Q4: console clean on load (independent of title)', async ({ page }) => {
    const errors = await gotoPage(page);
    await page.waitForTimeout(1500); // let late async errors surface
    expect(errors, 'Q4: console must be clean on load').toEqual([]);
  });

  test('Q2: region GROUND-TRUTH discovery — where (if anywhere) do .apx identifiers appear in rendered HTML?', async ({ page }) => {
    await gotoPage(page);
    const discovery = await page.evaluate((regionIds: readonly string[]) => {
      const html = document.documentElement.outerHTML;
      const attrHits = (needle: string) =>
        Array.from(document.querySelectorAll('*'))
          .filter((el) => Array.from(el.attributes).some((a) => a.value.includes(needle)))
          .slice(0, 6)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            matchedAttrs: Array.from(el.attributes)
              .filter((a) => a.value.includes(needle))
              .map((a) => `${a.name}="${a.value.slice(0, 120)}"`),
          }));
      const allIds = Array.from(document.querySelectorAll('[id]')).map((e) => e.id);
      return {
        totalElementsWithId: allIds.length,
        idInventorySample: allIds.filter((id) => !id.startsWith('P410_')).slice(0, 100),
        perRegion: Object.fromEntries(
          regionIds.map((r) => [
            r,
            { htmlOccurrences: html.split(r).length - 1, elements: attrHits(r) },
          ]),
        ),
      };
    }, PAGE.regions);
    console.log('REGION DISCOVERY:', JSON.stringify(discovery, null, 2));
    // Information-gathering test: only hard-fail if identifiers appear NOWHERE
    // in the HTML at all — that would falsify the docs' staticId->DOM claim
    // outright for these region types.
    for (const [id, info] of Object.entries(discovery.perRegion)) {
      expect.soft(
        (info as { htmlOccurrences: number }).htmlOccurrences,
        `region '${id}' should appear somewhere in rendered HTML`,
      ).toBeGreaterThan(0);
    }
  });

  test('Q3: apex.item() handles exist for every .apx pageItem and round-trip a value', async ({ page }) => {
    await gotoPage(page);

    const presence = await page.evaluate(
      (ids: readonly string[]) =>
        ids.map((id) => ({
          id,
          hasNode: !!document.getElementById(id),
          hasApexItem: !!(window as any).apex.item(id)?.node,
        })),
      [...PAGE.visibleItems.map((i) => i.id), ...PAGE.hiddenItems],
    );
    console.log('ITEM PRESENCE:', JSON.stringify(presence, null, 2));
    for (const p of presence) {
      expect(p.hasNode || p.hasApexItem, `item ${p.id} must exist in DOM or apex.item registry`).toBe(true);
    }

    // Round-trip through the official API — the primitive the whole testkit builds on.
    const roundTrip = await page.evaluate(() => {
      const it = (window as any).apex.item('P410_NAME');
      it.setValue('Spike Test');
      return it.getValue();
    });
    expect(roundTrip, 'Q3: apex.item setValue/getValue must round-trip').toBe('Spike Test');
  });

  test('Q2b: button GROUND-TRUTH — reverse-map real buttons by label, report their actual attributes', async ({ page }) => {
    await gotoPage(page);
    const labels = PAGE.buttons.map((b) => b.label as string);
    const report = await page.evaluate((wanted: string[]) => {
      const candidates = Array.from(
        document.querySelectorAll('button, a.t-Button, .t-Button, [role="button"]'),
      );
      return candidates
        .map((el) => ({
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          tag: el.tagName.toLowerCase(),
          id: (el as HTMLElement).id || null,
          attrs: Array.from(el.attributes)
            .map((a) => `${a.name}="${a.value.slice(0, 80)}"`)
            .slice(0, 10),
        }))
        .filter((b) => wanted.includes(b.text));
    }, labels);
    console.log('BUTTON DISCOVERY:', JSON.stringify(report, null, 2));
    expect(report.length, 'all three buttons should be findable by their labels').toBe(PAGE.buttons.length);
  });
});
