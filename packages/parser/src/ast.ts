/**
 * AST v0.1 — PROVISIONAL. Grammar assumptions inferred from Oracle's published
 * APEXlang documentation excerpts (26.1). Every assumption must be re-verified
 * against a real APEXlang export (see docs/grammar-assumptions.md) before this
 * contract is frozen. `raw` bags preserve everything we did not understand so
 * partial parsing never lies by omission.
 */

export interface Loc {
  file: string;
  line: number; // 1-based
}

/** Untyped property bag for constructs the typed layer doesn't model yet. */
export type RawValue =
  | string
  | number
  | boolean
  | RefValue
  | RawValue[]
  | { [key: string]: RawValue };

export interface RefValue {
  /** '@employee' -> 'employee'; '@/drawer' -> '/drawer' (standard theme). */
  ref: string;
  standard: boolean;
}

export type RawBag = Record<string, RawValue>;

/** Generic parse tree node: `type identifier ( ...props / children )`. */
export interface ComponentNode {
  type: string;            // 'page' | 'region' | 'item' | ... (open set)
  identifier: string | null;
  props: RawBag;           // flattened: group props keyed as 'appearance.pageMode'
  children: ComponentNode[];
  loc: Loc;
}

export interface ApexAppAst {
  astVersion: '0.1.0-provisional';
  pages: ApexPage[];
  /** Every file consumed, for cache invalidation and provenance. */
  sourceFiles: string[];
  /** Component types encountered that the typed projection skipped. */
  unmodeled: string[];
}

export interface ApexPage {
  id: number;
  alias: string | null;
  name: string | null;
  title: string | null;
  regions: ApexRegion[];
  items: ApexItem[];       // page-level items (not owned by a region)
  buttons: ApexButton[];
  dynamicActions: ApexDynamicAction[];
  loc: Loc;
  raw: RawBag;
}

export interface ApexRegion {
  identifier: string;
  name: string | null;
  /** Open string; see KNOWN_REGION_TYPES for the recognized subset. */
  type: string | null;
  source: { location: string | null; tableName: string | null; sql: string | null } | null;
  /** Only populated when `type === 'calendar'`. `settings.*` is reused by
   * other region types for unrelated config, so this is gated on type,
   * not just key presence, unlike `source` above. */
  calendarSettings: ApexCalendarSettings | null;
  items: ApexItem[];
  buttons: ApexButton[];
  loc: Loc;
  raw: RawBag;
}

/**
 * `settings { ... }` group on a calendar region, flattened and
 * re-projected here. `views` is the ordered list of enabled calendar
 * views (observed: day, week, month, list, navigation, year, plus custom
 * named views) -- the export key is `calendarViewsAndNavigation`. Many
 * other `settings.*` keys exist (e.g. `additionalCalendarViews`,
 * `dragAndDropPlsqlCode`, `initJavaScriptFunction`, `firstHour`,
 * `maxEventsDay`, `multipleLineEvents`, `showWeekend`, `escapeSpecialChars`)
 * and stay in the region's `raw` bag rather than getting a dedicated
 * typed field each -- these six are the ones with clear, direct testing
 * value (which column drives what, whether editing is enabled, which
 * views exist).
 */
export interface ApexCalendarSettings {
  displayColumn: string | null;
  startDateColumn: string | null;
  endDateColumn: string | null;
  pkColumn: string | null;
  showTime: boolean | null;
  views: string[] | null;
  dragAndDrop: boolean | null;
}

export interface ApexItem {
  identifier: string;      // e.g. P3_EMPNO
  type: string | null;     // textField | hidden | selectList | ...
  label: string | null;
  required: boolean;
  sourceColumn: string | null;
  loc: Loc;
  raw: RawBag;
}

export interface ApexButton {
  identifier: string;
  label: string | null;
  action: string | null;
  loc: Loc;
  raw: RawBag;
}

/**
 * `when { ... }` group, flattened onto the dynamicAction node and
 * re-projected here. `selectionType` is an open string (observed:
 * items, button, region, columns, domObject, eventSource, jquerySelector/
 * jQuerySelector, jsExpression) -- only the three most common carry a
 * dedicated typed field; everything else stays in the dynamicAction's
 * `raw` bag under the `when.*` prefix. `event` is the explicit trigger
 * event name (e.g. `click`, `focusout`, `apexafterrefresh`, or a
 * component-namespaced custom event like
 * `region/interactiveGrid/interactivegridselectionchange`) -- `null`
 * means APEX's implicit default event for this selector type, not "no
 * event." `customEvent` is populated specifically when `event ===
 * 'custom'` (confirmed live, e.g. `event: custom` / `customEvent:
 * apexendrecordedit`) -- per Oracle's own published APEXlang grammar
 * (docs.oracle.com/en/database/oracle/apex/26.1/apxln/apexlang.ebnf),
 * this is the ONLY case where `customEvent` applies; `null` otherwise.
 */
export interface ApexDATrigger {
  selectionType: string | null;
  items: string[] | null;
  button: string | null;
  region: string | null;
  event: string | null;
  customEvent: string | null;
}

/**
 * `clientSideCondition { ... }` group. `type` is an open string (observed:
 * item=value, item!=value, item>value, itemColumn=value, itemIsNull,
 * itemIsNotNull, jsExpression) -- `item`/`value` are populated when
 * present, `null` for condition types that don't use them (e.g.
 * itemIsNull, jsExpression).
 */
export interface ApexDAClientSideCondition {
  type: string | null;
  item: string | null;
  value: string | null;
}

export interface ApexDAAction {
  identifier: string;
  /** Optional display name, distinct from `identifier` -- confirmed real
   * and common (56/509 real actions across every export this project has
   * parsed have their own `name`, separate from the parent
   * dynamicAction's `name`). `null` when not set. */
  name: string | null;
  /** Open string: disable, enable, show, hide, setValue, addClass,
   * removeClass, executeJsCode, executeServerSideCode, redirectThisApp,
   * refresh, alert, confirm, definedByDynamicAction, or a namespaced
   * plugin action (plugin/timer, plugin/stripeReport, ...). */
  action: string | null;
  /** True-action list (default/unspecified) vs. false-action list. */
  fireWhenEventResultIs: boolean | null;
  loc: Loc;
  raw: RawBag;
}

export interface ApexDynamicAction {
  identifier: string;
  name: string | null;
  when: ApexDATrigger;
  /** `null` when the dynamicAction has no clientSideCondition block at all
   * (unconditional -- confirmed common, e.g. a plain refresh-on-event DA). */
  clientSideCondition: ApexDAClientSideCondition | null;
  actions: ApexDAAction[];
  loc: Loc;
  raw: RawBag;
}

export const KNOWN_REGION_TYPES = [
  'form',
  'interactiveReport',
  'interactiveGrid',
  'classicReport',
  'static',
] as const;
