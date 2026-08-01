/**
 * Explicit stubs for components this project has deliberately NOT built,
 * because there's zero (or insufficient) ground truth to verify against --
 * not because they were forgotten. Importing and constructing one of these
 * throws immediately with the specific reason, instead of a confusing
 * "not exported" error or, worse, silently letting someone build on an
 * unverified assumption the way `getRecords()`/the login() race condition/
 * the message-visibility bug all did before they were caught.
 *
 * This is the contract: if it's not here and not in
 * `packages/testkit/src/components/`, it doesn't exist yet. If it IS here,
 * the reason it doesn't exist yet is specific and current, not "TODO."
 * See docs/ecosystem-roadmap.md for the full status of each.
 */
import type { Page } from '@playwright/test';

export class UnsupportedComponentError extends Error {
  constructor(component: string, reason: string) {
    super(`${component} is not supported by @apx/testkit yet: ${reason}`);
    this.name = 'UnsupportedComponentError';
  }
}

function unsupportedComponent(name: string, reason: string): new (page: Page, id: string) => never {
  return class {
    constructor(_page: Page, _id: string) {
      throw new UnsupportedComponentError(name, reason);
    }
  } as new (page: Page, id: string) => never;
}

// InteractiveGrid graduated from a stub to a real component -- see
// components/interactive-grid.ts (ApexInteractiveGridRegion), verified live
// against Oracle's "Sample Interactive Grids" gallery app.

export const TreeRegion = unsupportedComponent(
  'TreeRegion',
  'no ground truth for a Tree region as a content/data-display pattern. The only Tree widget confirmed live ' +
    'in this project is the universal left-nav, reused for one app\'s login picker -- not a hierarchical data ' +
    'browser. See docs/ecosystem-roadmap.md Tier 3.',
);

export const Calendar = unsupportedComponent(
  'Calendar',
  'confirmed present in real exports (Oracle\'s "Sample Calendar" gallery app alone has 21 calendar regions; ' +
    'also seen in sample-master-detail and brookstrut) -- the .apx region\'s own config (displayColumn/' +
    'startDateColumn/endDateColumn/pkColumn/showTime/views/dragAndDrop) is now typed at the PARSER level ' +
    '(ApexRegion.calendarSettings), but this runtime component remains unbuilt: zero LIVE ground truth -- none ' +
    'of those apps was available with a running instance to check apex.region(id).widget().calendar(...) ' +
    'against. Typed metadata does not substitute for verified runtime behavior. See ' +
    'docs/ecosystem-roadmap.md Tier 2/3.',
);

export const MapRegion = unsupportedComponent(
  'MapRegion',
  'confirmed present in real exports (apextogo, sample-application-search), but zero LIVE ground truth -- ' +
    'neither app was available with a running instance to check against. No basis to design an API from ' +
    'documentation alone.',
);

/**
 * Single source of truth for which `ApexRegion.type` strings have NO
 * `@apx/testkit` component at all -- keyed by the exact region-type string,
 * pointing at the stub constructor that stands in for it. This is the SAME
 * set `packages/generator/src/coverage.ts`'s `UNTRACKABLE_REGION_TYPES`
 * must mirror exactly (see that file's own doc comment); a dedicated
 * regression test in `packages/generator/test/` cross-references the two
 * directly (exact set equality, plus confirming each entry still throws --
 * i.e. hasn't quietly graduated) so they can no longer drift silently the
 * way they did for Interactive Grid (graduated to a real component,
 * removed from here, but left in `UNTRACKABLE_REGION_TYPES` for an entire
 * prior session).
 *
 * Extend this ONLY when a region type gets a genuine, region-shaped
 * `UnsupportedComponentError` stub here (i.e. it stands in for an
 * `ApexRegion`, not an `ApexItem` -- Switch/RadioGroup/PopupLov/RichText/
 * FileBrowse/Shuttle below are item-shaped, not region-shaped, and do NOT
 * belong in this map) -- and update `coverage.ts`'s
 * `UNTRACKABLE_REGION_TYPES` in the SAME change.
 */
export const REGION_STUB_TYPES: Readonly<Record<string, new (page: Page, id: string) => never>> = {
  tree: TreeRegion,
  calendar: Calendar,
  map: MapRegion,
};

// Chart graduated from a stub to a real component -- see
// components/chart.ts (ApexChartRegion), verified live against Oracle's
// "Sample Charts" gallery app on THREE independent chart types. This
// corrected an earlier wrong finding: apex.region(id).widget() does NOT
// return null for chart regions (unlike the original claim in
// docs/quirks/26.1.json, based on a single region) -- it returns a real
// jQuery-wrapped element supporting the standard ojChart('option', ...)
// getter/setter, confirmed both directions. See chart.ts's module doc for
// the full correction.

export const Switch = unsupportedComponent(
  'Switch',
  'not among the item types this project has tested (textField, textarea, numberField, selectList, ' +
    'datePicker, hidden were -- Switch wasn\'t). Zero ground truth on widget-specific behavior beyond the ' +
    'generic apex.item() get/set contract.',
);

export const RadioGroup = unsupportedComponent(
  'RadioGroup',
  'not among the item types this project has tested. Zero ground truth on widget-specific behavior beyond ' +
    'the generic apex.item() get/set contract.',
);

export const PopupLov = unsupportedComponent(
  'PopupLov',
  'confirmed present in a real export (sample-dynamic-actions, item type popupLov, 7 occurrences), but zero ' +
    'LIVE ground truth. Oracle documents a fairly standard open/search/select flow, making this the most ' +
    'plausible near-term win among the untested item types, but it still needs a live app with one to verify ' +
    'against, not just documentation -- see docs/ecosystem-roadmap.md.',
);

export const RichText = unsupportedComponent(
  'RichText',
  'confirmed present in a real export (image-support-rte, item type richTextEditor), but zero LIVE ground ' +
    'truth -- that app was only ever seen as a static export, not a running instance. Still no basis to design ' +
    'an editor widget API from documentation alone.',
);

export const FileBrowse = unsupportedComponent(
  'FileBrowse',
  'not tested live. Upload interaction is a fundamentally different flow than simple value get/set, and ' +
    'this project has zero ground truth on it.',
);

export const Shuttle = unsupportedComponent(
  'Shuttle',
  'not tested live. Zero ground truth on the widget\'s move-left/move-right API surface.',
);

/**
 * Dynamic Action triggering -- not a component with a (page, id) shape,
 * so this is a plain function stub rather than a class.
 */
export function triggerDynamicAction(_page: Page, _name: string): never {
  throw new UnsupportedComponentError(
    'Dynamic Action triggering',
    'no known generic, documented JS API exists to trigger a *named* Dynamic Action programmatically -- DAs ' +
      'are bound to specific DOM events on specific components, not individually addressable by name as far ' +
      'as this project has found. This needs research into whether such a capability exists at all before ' +
      'any design -- see docs/ecosystem-roadmap.md.',
  );
}
