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
  /** `process <id> (...)` -- page-processing PL/SQL or built-in DML rules.
   * See ApexProcess. */
  processes: ApexProcess[];
  /** `computation <id> (...)` -- item-value-setting rules. See
   * ApexComputation. */
  computations: ApexComputation[];
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
  /** `column <id> (...)` -- report/Interactive Report/Interactive Grid
   * column definitions, lexically nested inside this region. See
   * ApexReportColumn. */
  columns: ApexReportColumn[];
  /** `action <id> (...)` -- row-level action/link nested directly inside a
   * Cards/List-family region (NOT the Dynamic-Action `action` nested inside
   * `dynamicAction`, which is `ApexDAAction` -- see ApexRegionAction's doc
   * comment for the confirmed distinction). */
  actions: ApexRegionAction[];
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
  /**
   * `advanced { htmlDomId: ... }` -- confirmed against the official EBNF's
   * `button-advanced-property` production (`docs.oracle.com/.../apexlang.ebnf`
   * `<button-advanced-property> ::= "htmlDomId" ... | "staticId" ...`), the
   * SAME `advanced` group shape and property name already confirmed for
   * regions (`ApexRegion.htmlDomId`, ADR-003) -- structurally, not just by
   * naming coincidence, this is the identical mechanism applied to a
   * different component type.
   *
   * UNLIKE the region case, this has NOT been positively live-verified with
   * a real button that actually sets it: a full sweep of every button
   * across this project's entire local corpus (46+ real exports, including
   * every page of UX Pattern Catalog -- the app used for the live check
   * below) found ZERO occurrences of `advanced { htmlDomId }` or
   * `advanced { staticId }` on any button, anywhere. What IS confirmed
   * live (UX Pattern Catalog, 3 pages, 7 buttons: Primary/Secondary Action
   * on `browse-interactive-report`/`faceted-search-cards`, Primary
   * Action/Cancel on `data-entry-simple-form`): when this field is `null`
   * (every button checked), the runtime DOM id is an APEX-internal
   * auto-generated id of the form `B<numeric>` (e.g. `B9442031345426189`)
   * -- structurally identical to region's `R<numeric>` fallback pattern --
   * with NO corresponding field anywhere in the static export, genuinely
   * undiscoverable from export data alone. This field is typed now so a
   * future button that DOES set a custom Static ID in Page Designer is
   * captured and diffable -- but `button.ts`'s accessible-role/label
   * locator strategy is deliberately UNCHANGED by this addition: extending
   * it to prefer `htmlDomId` when present would need a real button that
   * sets one to verify against (ADR-002), which does not exist anywhere in
   * this project's corpus yet. See docs/quirks/26.1.json
   * `button-id-not-static-id` and docs/ecosystem-roadmap.md.
   */
  htmlDomId: string | null;
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

/**
 * `process <id> (...)` -- a page-level, server-side processing rule (EBNF
 * `<process>`, the FULL production checked: direct properties
 * name/type/executionChain/formRegion/editableRegion, plus every group --
 * genAI/source/execution/successMessage/error/advanced/
 * serverSideCondition/security/config/comments). The fourth-confirmed
 * member of the canonical Page-Designer `branch`/`validation`/`process`/
 * `computation` cluster (`docs/ecosystem-roadmap.md`'s "Continuation"
 * pass, 2026-07-28/29) -- parser-only per that same decision: no client-JS
 * hook exists to observe "which process fired," the only externally
 * observable effect being the page's resulting state (a row inserted, a
 * redirect happened), which `@apx/testkit` can already assert on today
 * with zero process-specific runtime code. What has direct value: `type`
 * (open string, "SUPPORTED UI" in the EBNF -- no enumerated list, unlike
 * `chart.type`) directly distinguishes declarative DML processes
 * (`autoRowFetch`/`autoRowProcessing`/`formAutoRowProcessing`/
 * `interactiveGridAutoRowProcessing`) from custom PL/SQL (`executeCode`)
 * and built-in UI actions (`closeDialog`/`clearSessionState`), real CRUD-
 * detection signal. Real data: 1732 real processes confirmed across
 * 45/46 apps in this project's full corpus (near-universal -- the single
 * highest app-count of any construct this project has typed, branch/
 * validation included).
 *
 * CONFIRMED EBNF GAP (real data wins, ADR-004): the EBNF's
 * `<process-group-block>` enumerates exactly ten groups (genAI, source,
 * execution, successMessage, error, advanced, serverSideCondition,
 * security, config, comments) -- there is NO `target` group defined
 * anywhere in the `process` production. Real data confirms one anyway,
 * common and reproducible: `autoRowProcessing`/`formAutoRowProcessing`
 * processes (117 + 93 = 210 real instances) carry a
 * `target { tableName: ..., pkColumn: ..., pkItem: ..., returnKeyIntoItem:
 * ... }` group (confirmed live in Oracle's own `customers` starter app,
 * `p00002-customer-details.apx:1821`: `process
 * process-row-of-eba-cust-customers ( type: autoRowProcessing target {
 * tableName: EBA_CUST_CUSTOMERS pkColumn: ID pkItem: P2_ID
 * returnKeyIntoItem: P2_ID } ... )`) -- the same class of gap already
 * documented for `calendarSettings` (real properties entirely absent from
 * the grammar) and `branch.target` (grammar names a different, incompatible
 * shape). This `target` group is intentionally left untyped here (kept in
 * `raw` only) -- no concrete diff/coverage consumer has asked for
 * `tableName`/`pkColumn` specifically yet, matching this project's
 * restrained-typing bar; the gap itself is the citable finding, not a
 * reason to type the field.
 */
export interface ApexProcess {
  /** Confirmed ALWAYS present (1732/1732 real processes across this
   * project's full corpus) -- `process` behaves like `validation`/`region`/
   * `item`/`button` here, unlike `branch`. */
  identifier: string;
  name: string | null;
  /**
   * `type` direct property -- open string (EBNF: `<string-like-value>`,
   * "type: SUPPORTED UI", no enumerated list). Real values observed (1732
   * instances): executeCode (654), closeDialog (241), clearSessionState
   * (170), autoRowFetch (118), autoRowProcessing (117), formInitialization
   * (110), formAutoRowProcessing (93), invokeApi (75),
   * interactiveGridAutoRowProcessing (61), humanTaskManage (37), workflow
   * (16), executionChain (11), dataLoading (6), resetPagination (6),
   * parseUploadedData (5), loadUploadedData (5), humanTaskCreate (3),
   * plugin/ociDocumentGeneratorPrintDocument (3), formPagination (1).
   */
  type: string | null;
  sequence: number | null;
  /**
   * `execution.point` -- open string in the EBNF (`<string-like-value>`,
   * "applies when executionChain is not set"), UNLIKE `branch`'s sibling
   * `execution.point`, which the grammar enumerates to exactly 5 values.
   * Real values observed: beforeHeader (258), afterHeader (163), afterSubmit
   * (11), ajaxCallback (9), beforeRegions (8) -- a subset of the wider set
   * Oracle's Page Designer UI offers (e.g. "processing" is not observed in
   * this corpus), consistent with the grammar's open enum, not a
   * contradiction of it.
   */
  point: string | null;
  /** `null` when the process has no `serverSideCondition` block at all
   * (runs unconditionally, e.g. every real `autoRowFetch`/
   * `interactiveGridAutoRowProcessing` instance observed in this corpus).
   * Confirmed present on 750/1732 real processes -- reuses the identical
   * shared shape as `branch`/`validation` (see ApexServerSideCondition). */
  condition: ApexServerSideCondition | null;
  loc: Loc;
  raw: RawBag;
}

/**
 * `computation <id> (...)` -- a page-level rule that sets a single item's
 * value via a static value, SQL query, PL/SQL function body, or
 * expression (EBNF `<computation-a>`, the FULL production checked: direct
 * property itemName, plus every group -- execution/computation/error/
 * advanced/serverSideCondition/security/config/comments). The fourth
 * member of the canonical `branch`/`validation`/`process`/`computation`
 * cluster (see ApexProcess's doc comment for the shared reasoning) --
 * parser-only, same "no runtime hook" stopping point. Real data: 373 real
 * computations confirmed across 19/46 apps in this project's full corpus.
 *
 * NOT the same construct as `computation-b` (a DIFFERENT, unrelated
 * `computation <id> (...)` production nested inside a report's
 * `savedReport` child -- an Interactive Report/Grid COLUMN computation,
 * confirmed via the EBNF's own `saved-report-a-child-component` list and
 * distinct direct properties, `columnName`/`source.expression`, vs. this
 * construct's `itemName`/`computation.type`). Both share the bare
 * component-type name `computation` the same way `action` is overloaded
 * between this batch's `ApexRegionAction` and the Dynamic-Action
 * `ApexDAAction` -- `computation-b` is out of scope here (no concrete
 * consumer, nested inside the already out-of-scope `savedReport`) and
 * cannot be accidentally captured by this projection, since only a page's
 * DIRECT children are walked for `computation`, the same gating already
 * used for `branch`/`validation` (a `computation-b` only ever appears
 * nested under a region's `savedReport` child, never directly under
 * `page`). CONFIRMED live via this exact contamination almost happening:
 * an initial full-tree, position-blind grep-and-walk survey pass for this
 * batch counted 375 (not 373) and included `sample-reporting` in the
 * per-app list purely from that app's own `computation-b` instance
 * (`p00001-interactive-report.apx:499`, nested inside a `savedReport`
 * alongside `displayColumn`/`aggregate` siblings) -- re-verified against
 * this projection's own actual, position-scoped output (`page.
 * computations`, not a raw-tree walk) before recording the real 373/19
 * figures here, catching the contamination before it became a false
 * finding, not after.
 *
 * CONFIRMED EBNF DISCREPANCY (real data wins, ADR-004): every alternative
 * in `<computation-a-computation-property>` marks `"type" ":" <ws> ( ...
 * 7-value enum ... )` as "required" -- including as a precondition for
 * `sqlQuery` itself ("applies when type = QUERY"). Real data confirms
 * `type` can be entirely ABSENT while `computation.sqlQuery` is present
 * alone (confirmed live, `customers` starter app,
 * `p00050-customer.apx:5058`: `computation customer ( itemName: CUSTOMER
 * ... computation { sqlQuery: "select apex_escape.html(customer_name)
 * from eba_cust_customers where id = :P50_ID" } )` -- no `type:` line
 * anywhere in the block) -- `sqlQuerySingleValue` is the implicit default
 * when the `computation {}` group is present but `type` isn't set, the
 * same omission-means-default class of finding as `ApexChartSettings`'
 * bar-when-absent default. 149/373 real computations in this corpus show
 * this exact shape.
 */
export interface ApexComputation {
  /** Confirmed ALWAYS present (373/373 real computations captured by this
   * projection) -- behaves like `validation`/`process` here, unlike
   * `branch`. */
  identifier: string;
  /** `itemName` direct property -- the item this computation sets.
   * Confirmed present on 373/373 real computations this projection
   * captures (100% -- the only direct property `computation-a` defines,
   * and the only construct this projection captures under `computation`;
   * see this type's doc comment for the `computation-b` contamination this
   * figure was cross-checked against before being recorded). */
  itemName: string | null;
  sequence: number | null;
  /** `computation.type` -- open enum (7 values in the EBNF: staticValue,
   * item, sqlQuerySingleValue, sqlQueryMultipleValues, expression,
   * functionBody, preference). Real values EXPLICITLY observed on this
   * property: staticValue (117), functionBody (47), expression (43), item
   * (17). `sqlQuerySingleValue`/`sqlQueryMultipleValues`/`preference` have
   * ZERO explicit occurrences on `computation.type` in this corpus --
   * `sqlQuerySingleValue`/`sqlQueryMultipleValues` DO appear as real,
   * common literal values elsewhere in real exports, but only on the
   * unrelated page-item `source.type` property ("Based On" a SQL Query),
   * never once on `computation.type` itself (confirmed by direct
   * component-type inspection, not a bare text grep, after an initial
   * grep-based pass produced a false positive here). `null` when `type` is
   * absent -- see this type's doc comment for the confirmed
   * omission-means-`sqlQuerySingleValue`-default finding. */
  type: string | null;
  /** `null` when the computation has no `serverSideCondition` block at all
   * (runs unconditionally). Confirmed present on 60/373 real computations
   * -- reuses the identical shared shape as `branch`/`validation`/
   * `process`. */
  condition: ApexServerSideCondition | null;
  loc: Loc;
  raw: RawBag;
}

/**
 * `link.target` on a report column, confirmed the SAME real-data-vs-EBNF-
 * opaque-`<value>` divergence already documented for `ApexBranchTarget`
 * (see that type's doc comment, and `docs/grammar-assumptions.md`'s
 * `link.target` findings from the `strategic-planner` batch): every
 * `column-*-link-property` production in the EBNF types `target` as an
 * opaque `<value>`, with no `page`/`items`/`clearCache` shape defined
 * anywhere -- real data confirms a nested object every time (confirmed
 * live, Oracle's own `opportunities` starter app,
 * `p00002-accounts.apx:748`: `link { target: { page: 94 items: { P94_ID:
 * #ID# } clearCache: 94 action: resetPagination } linkText: #CUSTOMER_NAME#
 * }`). Unlike `ApexBranchTarget`, no external-URL variant (`type: url`) is
 * defined anywhere in any column-link production -- a column's link
 * target is always an in-app page redirect, never typed as opaque enough
 * to carry a URL alternative the way `branch`/`action` are.
 */
export interface ApexColumnLinkTarget {
  page: number | string | null;
  items: Record<string, string> | null;
  /** Kept as its string representation -- real data shows plain numbers
   * and `&ITEM.`/`#ITEM#` substitution tokens, same defensive handling as
   * `ApexBranchTarget.items`' values. */
  clearCache: string | null;
}

/**
 * `column <id> (...)` -- a report/Interactive Report/Interactive Grid
 * column definition, lexically nested inside a `region`. Confirmed to be
 * SIX sibling EBNF productions sharing the bare component name `column`
 * (`column-b` through `column-g`, one family each for Interactive Grid,
 * classicReport/tabular-form-style reports (two near-identical variants,
 * `column-c`/`column-d`), a `show`-toggle variant (`column-e`), a REST/
 * JSON-duality-view variant with a `name` direct property instead of
 * `columnName` (`column-f`), and a richer variant with cascading-LOV/
 * multiple-values/validation groups (`column-g`) -- all confirmed
 * `region-child-component` per the EBNF's own component index, NEVER
 * `page-child-component`, matching every real column observed in this
 * corpus being lexically nested inside a `region (...)` block, never a
 * page-level sibling referencing its region by `layout.region: @ref` the
 * way items/buttons can be). Deliberately NOT the chart-internal `axis`/
 * `series`/`column` styling trio already rejected in an earlier round
 * (`docs/grammar-assumptions.md`'s chart-region entry) -- that `column` is
 * a DIFFERENT, unrelated production (`region-chart-property`'s internal
 * styling group), not one of these six report-column productions; the two
 * were checked side by side specifically to keep them distinct. Real
 * data: 10,683 real columns confirmed across 39/46 apps in this project's
 * full corpus -- the single highest-volume construct typed in this batch
 * (`classicReport` alone is present on 35/46 apps, `interactiveReport`
 * 29/46).
 *
 * CONFIRMED EBNF DISCREPANCY (real data wins, ADR-004): every one of the
 * six productions' direct-property line marks `columnName` (or `name` for
 * `column-f`) "required." Not ONE of the 10,683 real columns in this
 * corpus emits it as a body property line -- the exporter ALWAYS uses the
 * component-id syntax slot instead (`column ENAME ( ... )`, `column COMM
 * ( ... )`), leaving the declared-required `columnName`/`name` property
 * permanently, universally absent from real property bodies (confirmed:
 * 0/10683 have a `columnName` or `name` body property; 10683/10683 carry a
 * real, non-generic component identifier instead). The opposite direction
 * of `branch`'s finding (there, the EBNF's optional `[component-id]` is
 * the one that's never real) -- here the EBNF's declared-required BODY
 * PROPERTY is the one that's never real, because the identical
 * information is always carried by the identifier slot instead.
 *
 * `link.target` reuses `ApexColumnLinkTarget` -- see that type's doc
 * comment for its own EBNF-vs-real-data cross-check.
 */
export interface ApexReportColumn {
  /** Confirmed ALWAYS present and the sole real carrier of the column's
   * name (10683/10683) -- see this type's doc comment for the confirmed
   * `columnName`/`name`-property-never-real finding. */
  identifier: string;
  /**
   * `type` direct property -- open string across all six sibling
   * productions (each with its own per-variant enum, not cross-checked
   * value-by-value here -- seeing which of the six variants applies would
   * require also typing the PARENT region's own type, out of scope for
   * this pass). Real values observed across 10,683 columns: plainText
   * (3340), hidden (1406), link (427), textField (223), numberField (171),
   * plainTextBasedOnLov (125), selectList (106), displayOnly (99), textarea
   * (84), rowSelector (70), actionsMenu (60), datePickerJquery (51), switch
   * (33), datePicker (32), htmlExpression (17), downloadBlob (11), checkbox
   * (10), radioGroup (10), percentGraph (5), colorPicker (4), password (4),
   * checkboxGroup (3), popupLov (3), plus a handful of
   * `plugin/*`/`themeTemplateComponent/*`-namespaced values -- an open set,
   * consistent with the EBNF's `<string-like-value>` typing (no shared
   * enum across all six variants).
   */
  type: string | null;
  /** `heading.heading` -- confirmed present on 8494/10683 real columns
   * (absent columns are typically `hidden`/`rowSelector` type, which the
   * EBNF itself gates this property against). */
  heading: string | null;
  /** `layout.sequence` -- confirmed present on effectively every real
   * column that has a `layout {}` group at all. */
  sequence: number | null;
  /** `null` when the column has no `link {}` group at all (confirmed the
   * dominant case -- 440/10683 real columns have one). See
   * ApexColumnLinkTarget. */
  linkTarget: ApexColumnLinkTarget | null;
  loc: Loc;
  raw: RawBag;
}

/**
 * `behavior.target`/`behavior.targetUrl` on a region-nested `action`. The
 * page-target half reuses the identical nested-object shape already
 * confirmed for `ApexBranchTarget`/`ApexColumnLinkTarget` (page/items/
 * clearCache) -- confirmed live, Oracle's own `sample-cards` gallery app,
 * `p00002-blob-column.apx:118`: `action action ( type: fullCard behavior {
 * target: { page: 14 items: { P14_EMPNO: &EMPNO. } clearCache: 14 } } )`.
 * Unlike `ApexColumnLinkTarget`, this construct's own grammar ALSO defines
 * a separate, FLAT `targetUrl` property (not nested under `target`) for
 * the external-URL-redirect variant -- confirmed live in `apextogo`'s home
 * page (`p00004-home.apx:151`: `action action ( type: fullCard behavior {
 * type: redirectUrl targetUrl: #action$open-search?category=&NAME. } )`)
 * -- kept as a sibling field on `ApexRegionAction` rather than folded into
 * this type, matching the EBNF's own flat-vs-nested property shape exactly.
 */
export interface ApexRegionActionTarget {
  page: number | string | null;
  items: Record<string, string> | null;
  clearCache: string | null;
}

/**
 * `action <id> (...)` -- a stand-alone row-level action/link nested
 * directly inside a Cards/List-family region (EBNF confirmed TWO sibling
 * `region-child-component` productions sharing the bare name `action`:
 * `action-d`, a Cards-region shape with a `type` direct property
 * (`button`/`fullCard`/`title`/`subtitle`/`media`), and `action-e`, a
 * List/template-driven shape with a `position` direct property (an open
 * string) -- both confirmed real in this corpus). Genuinely distinct from
 * the Dynamic-Action `action` nested inside `dynamicAction` (`action-c` in
 * the EBNF, already typed as `ApexDAAction`) -- confirmed by reading the
 * EBNF's own component index side by side (`action-c`'s parent production
 * is `dynamic-action-child-component`; `action-d`/`action-e`'s parent is
 * `region-child-component`, a structurally different position), per the
 * explicit "component type name `action` is OVERLOADED" warning already on
 * record in `docs/grammar-assumptions.md` before this batch. Deliberately
 * named `ApexRegionAction`, not a bare `Action`, so the two concepts can
 * never be confused by name alone. Real data: 2403 real `action`
 * component instances total across this project's full corpus; of those,
 * 2211 are the ALREADY-TYPED Dynamic-Action variant (nested inside
 * `dynamicAction`, captured by the existing `ApexDynamicAction.actions`
 * projection, unaffected by this batch) and 192 are this NEW, genuinely
 * distinct region-nested variant, across 14/46 apps (`region:cards` 43,
 * `region:themeTemplateComponent/contentRow` 145 -- the Universal-Theme
 * "content row" template's own action slots -- plus a handful on
 * `themeTemplateComponent/comments` and `appTemplateComponent/
 * contentRowSimple`).
 *
 * CONFIRMED IMPLICIT DEFAULT (real data wins, ADR-004): `action-d`'s
 * direct property line marks `type` "required." Real data confirms it is
 * frequently OMITTED with only `label` present (confirmed live,
 * `sample-cards`, `p00002-blob-column.apx:185`: `action action ( label:
 * Edit layout { sequence: 10 } behavior { target: { ... } } )` -- no
 * `type:` line at all) -- 169/192 real region-nested actions in this
 * corpus have neither `type` nor `position` set, consistent with `button`
 * (action-d's own default row-affordance) being the implicit default when
 * neither direct property is present, the same omission-means-default
 * class of finding as `ApexChartSettings`' bar default and
 * `ApexComputation.type`'s `sqlQuerySingleValue` default above -- NOT
 * asserted here with full certainty (kept `null`, not coerced to
 * `'button'`, unlike the Chart case) since this batch's evidence is
 * real but narrower than the Chart precedent's 65-region confirmation.
 */
export interface ApexRegionAction {
  /** Confirmed ALWAYS present (2403/2403 including the already-typed
   * Dynamic-Action variant; 192/192 for this new region-nested variant
   * specifically) but NOT reliably unique per region -- a substantial
   * fraction of real actions use the literal string `"action"` (or
   * `"actions"`) as their identifier when the developer never renamed it
   * from Page Designer's own default (confirmed: 23 real `action`
   * identifiers, 4 real `action-2`, 2 `action-3` -- APEX auto-suffixes a
   * SECOND+ default-named action WITHIN THE SAME region for uniqueness,
   * but the first one stays the bare literal `"action"`, and different
   * regions/apps independently reproduce that same default). A genuinely
   * renamed action carries a real, meaningful identifier instead (`edit`,
   * `delete`, `approve`, `claim`, `reject`, `terminate`, ... -- all
   * confirmed real in `strategic-planner`). Kept `string` (never `null`,
   * unlike `branch`) since the identifier slot is always populated one way
   * or another; `apx-diff` matches these per-region by identifier via the
   * same `diffByIdentifier` items/buttons already use -- a same-region
   * collision (two literally-"action"-named actions in ONE region) is not
   * observed anywhere in this corpus (real APEX auto-suffixing already
   * prevents it within a single region) but is not structurally
   * impossible, an honest, documented limitation of this choice. */
  identifier: string;
  label: string | null;
  /** Whichever of the EBNF's two mutually-exclusive direct properties is
   * present on this specific action -- `type` (Cards-region shape) or
   * `position` (List/template-driven shape); `null` when NEITHER is set
   * (see this type's doc comment for the confirmed-common omission
   * finding). */
  kind: string | null;
  /** `behavior.target` -- `null` when absent (e.g. a `triggerAction`-type
   * action that fires a Dynamic-Action-style behavior instead of a
   * redirect, kept in `raw` rather than typed further here). */
  target: ApexRegionActionTarget | null;
  /** `behavior.targetUrl` -- the flat external-URL-redirect variant,
   * sibling to `target` rather than nested inside it (see
   * `ApexRegionActionTarget`'s doc comment). `null` for every other
   * `behavior.type`. */
  url: string | null;
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
