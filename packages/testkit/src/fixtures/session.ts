/**
 * Navigation helpers -- VERIFIED contract (V1 in docs/grammar-assumptions.md):
 * friendly URL = lowercased page alias appended to the app base; a page with
 * `authentication: public` serves 200 with no redirect/session bounce.
 *
 * `gotoApexPage` is the one entry point generated specs and hand-written
 * specs should both use to load a page -- it arms the console guard *before*
 * navigating (so nothing is missed) and waits for `apex.item` to exist,
 * which is the earliest reliable signal the APEX JS runtime has booted.
 */
import { expect, type Page } from '@playwright/test';
import { armConsoleGuard } from './console-guard.js';

export function apexPageUrl(appBase: string, pageAlias: string, friendlyUrls = true): string {
  if (!friendlyUrls) {
    throw new Error(
      'apexPageUrl(): this application declares runtime.friendlyUrls: false. Legacy f?p URL generation is not yet ' +
        'implemented because it requires additional application/session metadata; refusing to generate a wrong URL.',
    );
  }
  return `${appBase.replace(/\/+$/, '')}/${pageAlias.toLowerCase()}`;
}

export async function gotoApexPage(page: Page, url: string): Promise<string[]> {
  const errors = armConsoleGuard(page);
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(resp?.ok(), `GET ${url} -> ${resp?.status()}`).toBe(true);
  await page.waitForFunction(() => typeof (window as any).apex?.item === 'function');
  return errors;
}

/**
 * Normalize a page title before comparing against .apx metadata -- VERIFIED
 * rule (V4): runtime titles differ from .apx source by invisible dash/space
 * variants. Never compare titles with raw equality.
 */
export function normalizeTitle(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\s\u00A0]+/g, ' ')
    .trim();
}
