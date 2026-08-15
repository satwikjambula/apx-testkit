/**
 * pageItem wrapper -- VERIFIED contract (V2/V3 in docs/grammar-assumptions.md):
 * a .apx pageItem identifier maps to the DOM node id VERBATIM for every item
 * type tested (textField, textarea, numberField, selectList, datePicker,
 * hidden), and `apex.item(id)` setValue/getValue round-trips through it.
 *
 * This is the only component wrapper with a fully verified DOM contract --
 * region.ts and button.ts are intentionally thinner until their discovery
 * reports land (see docs/grammar-assumptions.md "Still open").
 */
import { expect, type Page } from '@playwright/test';
import { recordCoverageTouch } from '../fixtures/coverage.js';

export interface ItemPresence {
  id: string;
  ok: boolean;
}

/** Check that every declared pageItem id resolves in the DOM / apex.item registry. */
export async function itemsPresent(page: Page, ids: readonly string[], pageId?: number): Promise<ItemPresence[]> {
  const presence = await page.evaluate(
    (ids: readonly string[]) =>
      ids.map((id) => ({
        id,
        ok: !!document.getElementById(id) || !!(window as any).apex.item(id)?.node,
      })),
    ids,
  );
  for (const item of presence) if (item.ok) recordCoverageTouch('item', item.id, pageId);
  return presence;
}

/** Assert every declared pageItem id resolves; fails with the list of missing ids. */
export async function expectItemsPresent(page: Page, ids: readonly string[], pageId?: number): Promise<void> {
  const presence = await itemsPresent(page, ids, pageId);
  const missing = presence.filter((p) => !p.ok).map((p) => p.id);
  expect(missing, 'items declared in .apx but absent at runtime').toEqual([]);
}

export async function getItemValue(page: Page, id: string, pageId?: number): Promise<string> {
  const value = await page.evaluate((id: string) => (window as any).apex.item(id).getValue(), id);
  recordCoverageTouch('item', id, pageId);
  return value;
}

export async function setItemValue(page: Page, id: string, value: string, pageId?: number): Promise<void> {
  await page.evaluate(
    (args: [string, string]) => (window as any).apex.item(args[0]).setValue(args[1]),
    [id, value] as [string, string],
  );
  recordCoverageTouch('item', id, pageId);
}

/** Round-trip a value through apex.item(id) and return what getValue() reports back. */
export async function itemRoundTrip(page: Page, id: string, value: string, pageId?: number): Promise<string> {
  const result = await page.evaluate(
    (args: [string, string]) => {
      const it = (window as any).apex.item(args[0]);
      it.setValue(args[1]);
      return it.getValue();
    },
    [id, value] as [string, string],
  );
  recordCoverageTouch('item', id, pageId);
  return result;
}

/**
 * Ergonomic wrapper for hand-written specs. Generated code uses the plain
 * functions above (simpler to emit deterministically); this class is for
 * people, not the generator.
 */
export class ApexItem {
  constructor(
    private readonly page: Page,
    public readonly id: string,
    public readonly pageId?: number,
  ) {}

  exists(): Promise<boolean> {
    return this.page
      .evaluate((id: string) => !!document.getElementById(id) || !!(window as any).apex.item(id)?.node, this.id)
      .then((value) => {
        const exists = Boolean(value);
        if (exists) recordCoverageTouch('item', this.id, this.pageId);
        return exists;
      });
  }

  getValue(): Promise<string> {
    return getItemValue(this.page, this.id, this.pageId);
  }

  setValue(value: string): Promise<void> {
    return setItemValue(this.page, this.id, value, this.pageId);
  }
}
