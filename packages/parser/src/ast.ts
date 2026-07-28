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
  /** `branch (...)` -- page-processing redirect rules. See ApexBranch. */
  branches: ApexBranch[];
  /** `validation <id> (...)` -- server-side field/page validation rules.
   * See ApexValidation. */
  validations: ApexValidation[];
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
  /** Only populated when `type === 'chart'`. */
  chartSettings: ApexChartSettings | null;
  /**
   * `advanced { htmlDomId: ... }`, confirmed against the official EBNF's
   * `region-advanced-property` production. This is the real, deterministic
   * root cause of a long-open question in this project (see
   * docs/quirks/26.1.json `region-id-not-static-id`): a region's RUNTIME
   * static id -- the id `apex.region()` and the widget container element
   * (`<runtime id>_jet` for Chart, `<runtime id>_ig` for Interactive Grid)
   * actually use -- can differ from the `.apx` export's own `identifier`.
   * When `htmlDomId` is set here, it deterministically PREDICTS that
   * runtime id -- confirmed live across Chart (`pie1`, `donut1`,
   * `stackCategoryChart`) and Interactive Grid (`emp`, consistently across
   * every page in that export) region examples. When `null` (confirmed:
   * 65/97 real chart regions in Oracle's own "Sample Charts" app have no
   * `advanced { }` override at all), the runtime id is an APEX-internal
   * auto-generated numeric id (e.g. `R738095923010136870`) that has NO
   * corresponding field anywhere in the static `.apx` export -- genuinely
   * undiscoverable from export data alone, not a parser gap.
   */
  htmlDomId: string | null;
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

/**
 * `chart { type: ... }` group on a chart region, confirmed against
 * Oracle's official EBNF (`region-chart-property`, 17 enum values: area,
 * bar, boxPlot, bubble, combination, statusMeterGauge, donut, funnel,
 * gantt, line, lineWithArea, pie, polar, pyramid, radar, range, scatter,
 * stock). Deliberately the ONLY field typed here -- `chartAppearance`,
 * `chartLayout`, and the sibling `axis`/`series`/`column` components are
 * almost entirely visual styling (fonts, colors, positions, axis
 * scaling) with no clear testing value; they stay in `raw`/`unmodeled`
 * rather than bloating this type for properties nothing would ever
 * assert on.
 *
 * `type` is never `null`: confirmed live that the `chart {}` group is
 * entirely OMITTED from the export when the chart type is `bar` --
 * Oracle's own gallery app has 16 bar-chart regions, none of which have a
 * `chart {}` group at all. `bar` is the implicit default when the group
 * is absent, not missing data -- represented directly as `'bar'` here
 * rather than `null`, so nothing downstream has to re-derive that
 * omission-means-bar convention itself.
 */
export interface ApexChartSettings {
  type: string;
}

export interface ApexItem {
  identifier: string;      // e.g. P3_EMPNO
  type: string | null;     // textField | hidden | selectList | ...
  label: string | null;
  required: boolean;
  sourceColumn: string | null;
  /**
   * `lov { type: sharedComponent, lov: @name }` -- the named LOV (shared
   * component) this item points to. Confirmed against the official EBNF's
   * `page-item-lov-property` (`"lov" ":" <ws> <reference>`, applies when
   * `type = SHARED`) and against real data across the full corpus:
   * 281/470 `selectList`, 65/112 `radioGroup`, and 14/49 `popupLov` items
   * use a shared-component LOV (the rest use inline `sqlQuery`/
   * `staticValues`/`functionBody`, which have no named reference to type).
   * Deliberately gated to these three item types -- the narrow scope
   * Product Architect approved (see docs/ecosystem-roadmap.md "Seventh
   * round") -- NOT because the underlying data only supports these three:
   * the identical `lov { type: sharedComponent, lov: @name }` shape is
   * also real and common on `checkboxGroup` (30/70), `selectOne` (13/37),
   * `displayOnly` (23/251), `shuttle` (1/4), and
   * `textFieldWithAutocomplete` (1/2) items across this corpus. Those stay
   * in `raw` (`lov.lov`) rather than populating this field, honoring the
   * explicit scope decision rather than silently expanding it. Resolving
   * the LOV *definition itself* (`shared-components/lovs.apx`'s actual
   * list of values) remains explicitly out of scope -- see the same
   * roadmap entry.
   */
  lovName: string | null;
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

/**
 * `serverSideCondition { ... }` -- shared shape used by both `branch`
 * (`branch-a-server-side-condition-property`) and `validation`
 * (`validation-b-server-side-condition-property`) in the official EBNF:
 * same property names, same semantics, confirmed by reading both full
 * productions side by side. `type` is an open string (observed across
 * 325 real branches + 353 real validations in this project's full
 * corpus: expression, item=value, item!=value, request=Value,
 * request!=Value, itemIsNull, never, functionBody, ... -- or entirely
 * absent, see below). `item`/`value`/`plsqlExpression` are populated when
 * the corresponding `type` uses them, `null` otherwise.
 * `whenButtonPressed` (parsed via `refName()`, dropping the `@` sigil) is
 * the single dominant real shape: 144/325 real branches and 129/353 real
 * validations have ONLY `whenButtonPressed` set, no `type` at all --
 * "run only when this specific button submitted the page," no further
 * condition logic needed.
 */
export interface ApexServerSideCondition {
  whenButtonPressed: string | null;
  type: string | null;
  item: string | null;
  value: string | null;
  plsqlExpression: string | null;
}

/**
 * `behavior { target: { ... } }` on a `branch`. See ApexBranch's doc
 * comment for the EBNF-vs-real-data discrepancy this is built from.
 */
export interface ApexBranchTarget {
  /**
   * The target page. Real data confirms THREE distinct shapes, not just
   * the plain page number the EBNF's sibling `button`/`menu` "LINK_IN_APP"
   * value type would suggest: a literal page number (317/325 real
   * branches with a target -- the dominant case, e.g. `page: 90`), a page
   * ALIAS string (e.g. `page: CUSTOMERS`, confirmed live in Oracle's own
   * `customers` starter app, `p00002-customer-details.apx`), or an
   * item-substitution token (e.g. `page: &LAST_VIEW.`, same app -- an
   * entirely unconditional branch with no `serverSideCondition` at all,
   * also confirmed real). Kept as the raw number-or-string union rather
   * than coerced to one shape, since the alias/substitution cases cannot
   * be normalized to a page number without runtime evaluation.
   */
  page: number | string | null;
  /** External URL redirect variant (`target: { type: url, url: ... }`),
   * confirmed live in `apextogo`'s sign-out branch
   * (`url: &LOGOUT_URL.`). `null` for the page-target variants above. */
  url: string | null;
  /** `ITEM: value` pairs carried across the redirect (`target: { items: {
   * P90_REQUEST_ID: &P10_RESULT_ID. } }`), when present. */
  items: Record<string, string> | null;
}

/**
 * `branch (...)` -- a page-level, server-side redirect rule (EBNF
 * `branch-a`, the FULL production checked: direct `name` property plus
 * every group -- execution/behavior/serverSideCondition/security/config/
 * comments). Parser-only per Product Architect's Seventh Round decision
 * (docs/ecosystem-roadmap.md, 2026-07-27) -- deliberately NO runtime
 * component: the only externally observable effect of a branch firing is
 * which page/URL is landed on, already assertable today via
 * `@apx/testkit`'s `page.url()` with zero branch-specific runtime code
 * (the same reasoning that already excluded `branch` from an earlier
 * Navigation Graph proposal, "needs parser extension first"). What DOES
 * have direct value: a typed, diffable field for `apx-diff` and a base
 * for future unreachable-branch static analysis / coverage-recording
 * input. Real data: 325 real branches confirmed across this project's
 * full corpus (concurrent-manager, the prompting app, alone: 6 pages).
 *
 * CONFIRMED DISCREPANCY vs. the official EBNF (real data wins, ADR-004):
 * `branch-a-behavior-property` types `target` as a single opaque scalar
 * `<value>` (string/identifier/number/reference/multiline-string/array)
 * with a sibling `type` enum (`pageOrUrl`/`urlIdentifiedByItem`/...) and a
 * flat `pageNumber` property. Real data never matches this shape --
 * `target` is ALWAYS a nested object group (`target: { page: N, items: {
 * ... }, clearCache: N|[N]|&ITEM., action: ..., successMessage: ...,
 * request: ... }`, or `target: { type: url, url: ... }` for the external-
 * redirect variant). This is the same class of gap already documented for
 * `calendarSettings` (real properties entirely absent from the grammar) --
 * here the grammar has an entry for the concept, but not one that matches
 * what real 26.1 exports actually produce. See
 * `docs/grammar-assumptions.md`.
 */
export interface ApexBranch {
  /**
   * Confirmed ALWAYS `null` across every real branch in this project's
   * full corpus (0/325) -- the EBNF's `[component-id]` on `branch-a` is
   * optional, and in practice never present. `branch` is the one
   * page-child-component type observed with NO identifier at all
   * (contrast `validation`, `region`, `item`, `button`: always present).
   * `apx-diff` cannot key branches by identifier the way it does every
   * other construct -- see `diffBranches()` in
   * `packages/generator/src/diff.ts`, which matches positionally instead.
   * Typed `string | null` rather than a literal `null` in case a future
   * export ever does carry one.
   */
  identifier: string | null;
  name: string | null;
  sequence: number | null;
  /** `execution { point: ... }` -- when in the page lifecycle this branch
   * evaluates (observed: beforeHeader, afterSubmit, validating,
   * processing, afterProcessing). `null` when unset (APEX's implicit
   * default point). */
  point: string | null;
  /** `null` when the branch has no `behavior { target: { ... } } ` data
   * at all (not observed in this project's corpus, but the EBNF does not
   * guarantee it, so this stays defensive rather than assumed present). */
  target: ApexBranchTarget | null;
  /** `null` when the branch is unconditional (confirmed real and common,
   * e.g. Oracle's own `customers` starter app has a `&LAST_VIEW.`-target
   * branch with no `serverSideCondition` block at all). */
  condition: ApexServerSideCondition | null;
  loc: Loc;
  raw: RawBag;
}

/** `error { ... }` group on a `validation`. */
export interface ApexValidationError {
  /** `errorMessage` -- confirmed live as BOTH a bare single-line value
   * and (per the EBNF's `<multiline-string>`/TEXT EDITOR typing) a
   * fenced block; handled via the same `multilineText()` helper already
   * used for `region.source.sql`. */
  message: string | null;
  displayLocation: string | null;
  /** The item this validation's error attaches to, when `editableRegion`
   * is not set (265/353 real validations -- the dominant, item-scoped
   * case). Parsed via `refName()`. */
  associatedItem: string | null;
  /** The report/IG column this validation's error attaches to, when
   * `editableRegion` IS set (23/353 -- rarer, column-scoped case,
   * confirmed distinct from `associatedItem` per the EBNF's
   * `editableRegion`-gated property alternation). */
  associatedColumn: string | null;
}

/**
 * `validation <id> (...)` -- a page-level, server-side field/page
 * validation rule (EBNF `validation-b`, the full production checked:
 * execution/validation/advanced/error/serverSideCondition/security/
 * config/comments groups). Typed AST field ships now; a runtime
 * validation-failure-display component is explicitly DEFERRED pending a
 * separate live-verification check of whether `messages.ts`'s existing
 * `apex.message`/`#APEX_ERROR_MESSAGE` wrapper already covers it (see
 * docs/ecosystem-roadmap.md "Seventh round" and
 * `.ai/knowledge/verification.md`'s concurrent-manager entry) -- that
 * finding does not block this parser-only field. Real data: 353 real
 * validations confirmed across this project's full corpus
 * (concurrent-manager, the prompting app, alone: 34 pages).
 *
 * NOT the same construct as `ApexItem.required` (`page-item-validation`'s
 * `valueRequired`, a DIFFERENT `validation { ... }` group that lives
 * directly on an item, already typed) -- nor `validation-a` (a
 * `supporting-objects`-only, install-time validation construct, confirmed
 * real but rare -- 2 files in this project's whole corpus -- and out of
 * scope here, left unmodeled).
 */
export interface ApexValidation {
  /** Confirmed ALWAYS present (353/353 real validations across this
   * project's full corpus carry a component-id) -- unlike `branch`,
   * `validation` behaves like every other page-child-component here. */
  identifier: string;
  name: string | null;
  sequence: number | null;
  /**
   * `validation { type: ... }` -- the rule kind. Open string, confirmed
   * against BOTH of the EBNF's item-scoped and column-scoped enums (9
   * distinct real values seen: itemIsNotNull (92), noRowsReturned (70),
   * functionBodyReturningBoolean (29), itemMatchesRegexp (28),
   * itemIsAValidTimestamp (12), rowsReturned (5), itemIsNumeric (5),
   * functionBody (4), columnMatchesRegexp (3) -- across 353 real
   * validations). No discrepancy found here: real data confirms the
   * grammar's enum exactly.
   */
  type: string | null;
  /** `validation { item: ... }` -- the item this rule checks, for
   * item-scoped `type`s (137/353 real validations). `null` for
   * column-scoped (`editableRegion` set) or rule kinds that reference no
   * single item (sql/PLSQL-expression, rows-returned rules). */
  item: string | null;
  /** `validation { column: ... }` -- the report/IG column this rule
   * checks, for column-scoped `type`s (3/353 -- rare but real, confirmed
   * distinct from `item` per the EBNF's `editableRegion`-gated property
   * alternation, same gating as `ApexValidationError.associatedColumn`). */
  column: string | null;
  error: ApexValidationError | null;
  /** `null` when the validation has no `serverSideCondition` block at all
   * (runs unconditionally on every submit that reaches it). */
  condition: ApexServerSideCondition | null;
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
