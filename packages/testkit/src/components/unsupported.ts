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
  'never encountered in any app this project has touched, live or otherwise. No basis to design an API yet.',
);

export const MapRegion = unsupportedComponent(
  'MapRegion',
  'never encountered in any app this project has touched, live or otherwise. No basis to design an API yet.',
);

export const Chart = unsupportedComponent(
  'Chart',
  'confirmed present live (Oracle JET, SVG-rendered), but container DOM ids are JET-generated hashes, not the ' +
    '.apx static id -- unlike pageItems. Needs its own discovery pass into what apex.region(id).widget() ' +
    'exposes before a wrapper can be verified, not assumed. See docs/ecosystem-roadmap.md Tier 2.',
);

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
  'not tested live. Oracle documents a fairly standard open/search/select flow, making this the most ' +
    'plausible near-term win among the untested item types, but it still needs a live app with one to verify ' +
    'against, not just documentation -- see docs/ecosystem-roadmap.md.',
);

export const RichText = unsupportedComponent(
  'RichText',
  'not tested live. Zero ground truth on the editor widget\'s API surface.',
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
