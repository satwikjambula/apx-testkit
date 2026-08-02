/**
 * AST page -> PageObject class emit. Typed item accessors and button
 * click methods, built entirely on @apx/testkit primitives — no raw
 * selectors, matching the treadmill rule (see lib.ts header).
 *
 * Item accessors rest on the VERIFIED apex.item contract (V2/V3 in
 * docs/grammar-assumptions.md). Button methods use accessible-role/label
 * locators because the button DOM convention is still an open ledger item —
 * see button.ts in @apx/testkit for why that's the deliberate choice.
 *
 * Naming (identifier -> property/method name) is pure string manipulation,
 * so output stays byte-identical for identical input (the determinism
 * contract in lib.ts).
 */
import type { ApexItem, ApexPage } from '@apx/parser';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const RESERVED = new Set(['constructor', 'page', 'url', 'goto', 'alias', 'then']);

function toIdentifierPart(raw: string): string {
  const parts = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'x';
  return parts.map((p, i) => (i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase())).join('');
}

function dedupe(name: string, used: Set<string>): string {
  let candidate = name;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${name}${n}`;
    n++;
  }
  used.add(candidate);
  return candidate;
}

/** Deterministic identifier -> pageObject property name, e.g. P410_START_DATE -> startDate. */
export function computeItemPropNames(page: ApexPage): Map<string, string> {
  const prefix = `P${page.id}_`;
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const item of page.items) {
    const stripped = item.identifier.startsWith(prefix) ? item.identifier.slice(prefix.length) : item.identifier;
    let name = toIdentifierPart(stripped);
    if (/^[0-9]/.test(name)) name = `item${name[0]!.toUpperCase()}${name.slice(1)}`;
    if (RESERVED.has(name)) name = `${name}Item`;
    out.set(item.identifier, dedupe(name, used));
  }
  return out;
}

/** Deterministic identifier -> click method name, e.g. 'apply' -> clickApply. Buttons without a label are skipped (nothing safe to locate them by). */
export function computeButtonMethodNames(page: ApexPage): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const button of page.buttons) {
    if (!button.label) continue;
    const base = toIdentifierPart(button.identifier);
    const capitalized = base ? base[0]!.toUpperCase() + base.slice(1) : 'Button';
    out.set(button.identifier, dedupe(`click${capitalized}`, used));
  }
  return out;
}

/** Deterministic page alias/name -> PascalCase class name, e.g. 'data-entry-simple-form' -> DataEntrySimpleFormPage. */
export function pageObjectClassName(page: ApexPage): string {
  const source = page.alias ?? page.name ?? `Page${page.id}`;
  const parts = source.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const pascal = parts.map((p) => p[0]!.toUpperCase() + p.slice(1).toLowerCase()).join('');
  return `${pascal || `Page${page.id}`}Page`;
}

export function pageObjectBaseName(page: ApexPage): string {
  const path = (page.alias ?? '').toLowerCase();
  return `p${String(page.id).padStart(5, '0')}-${path}.page`;
}

/** Deterministic page id/alias -> generated spec filename, e.g. p00410-data-entry-simple-form.spec.ts. Single source of truth shared by lib.ts (generate) and diff.ts (affected-file cross-reference) so they can never drift apart. */
export function specFileName(page: ApexPage): string {
  return `p${String(page.id).padStart(5, '0')}-${(page.alias ?? '').toLowerCase()}.spec.ts`;
}

/** Deterministic page id/alias -> generated page-object filename, e.g. p00410-data-entry-simple-form.page.ts. */
export function pageObjectFileName(page: ApexPage): string {
  return `${pageObjectBaseName(page)}.ts`;
}

/** Deterministic page id/alias -> generated docs filename, e.g. p00410-data-entry-simple-form.docs.md. Single source of truth for this naming scheme, shared by docs.ts (generateDocs) the same way specFileName/pageObjectFileName already are shared by lib.ts and diff.ts. */
export function docsFileName(page: ApexPage): string {
  return `p${String(page.id).padStart(5, '0')}-${(page.alias ?? '').toLowerCase()}.docs.md`;
}

function itemDoc(item: ApexItem): string {
  const bits = [item.type ?? 'unknown'];
  if (item.label) bits.push(`"${esc(item.label)}"`);
  if (item.required) bits.push('required');
  return bits.join(', ');
}

export function pageObjectFor(page: ApexPage): string {
  const className = pageObjectClassName(page);
  const alias = (page.alias ?? '').toLowerCase();
  const itemNames = computeItemPropNames(page);
  const buttonNames = computeButtonMethodNames(page);

  const itemAccessors = page.items.map(
    (item) => `  /** ${itemDoc(item)} */
  get ${itemNames.get(item.identifier)}(): ApexItem {
    return new ApexItem(this.page, '${esc(item.identifier)}');
  }`,
  );

  const buttonMethods: string[] = [];
  for (const button of page.buttons) {
    const method = buttonNames.get(button.identifier);
    if (!method) continue; // no label -> nothing safe to locate by, skipped deliberately
    buttonMethods.push(`  /** "${esc(button.label!)}" */
  async ${method}(): Promise<void> {
    await buttonByLabel(this.page, '${esc(button.label!)}').click();
  }`);
  }

  const body = [...itemAccessors, ...buttonMethods].join('\n\n');

  return `/**
 * GENERATED by apx-testgen from pages/p${String(page.id).padStart(5, '0')}-${alias}.apx — DO NOT EDIT.
 * Typed accessor page object built on @apx/testkit primitives — no raw
 * selectors. Item accessors rest on the VERIFIED apex.item contract; button
 * methods use accessible-role/label locators (region/button DOM convention
 * still open — see docs/grammar-assumptions.md).
 */
import type { Page } from '@playwright/test';
import { ApexItem, apexPageUrl, buttonByLabel, gotoApexPage } from '@apx/testkit';
import { APP_BASE } from '../playwright.config.js';

export class ${className} {
  static readonly alias = '${esc(alias)}';

  constructor(private readonly page: Page) {}

  url(): string {
    return apexPageUrl(APP_BASE, ${className}.alias);
  }

  /** Navigate here and arm the console guard; returns any console/page errors seen. */
  async goto(): Promise<string[]> {
    return gotoApexPage(this.page, this.url());
  }

${body}
}
`;
}
