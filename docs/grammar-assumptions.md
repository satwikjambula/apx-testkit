# Grammar ledger — updated against a REAL 26.1 export

Ground truth: UX Pattern Catalog app export, manifest mmdVersion 26.1.0+3102.
Parser status: parses the full export (19 pages, application.apx, page-groups,
all shared-component .apx files) with ZERO warnings. Ledger below records what
is verified, what changed vs. the docs-derived guesses, and what remains open.

## Verified (from real files)

- [x] Component: `type [identifier] ( ... )`. Roots seen: `app IDENT (`,
      `page N (`, plus `list`, `lov`, `authentication`, `authorization`,
      `breadcrumb`, `buildOption`, `componentSetting`, `file`, `pageGroup`...
- [x] Item component is `pageItem`, NOT `item` (docs example was simplified).
      Parser accepts both; projection treats them identically.
- [x] Properties are newline-terminated `name: value`, no commas. Scalars run
      to end of line (spaces, en-dashes, colons, inline HTML all legal).
- [x] Property KEYS may be numeric (`userDefinedAttributes { 1: ... }`).
- [x] Groups `name { ... }` AND object-valued properties `name: { ... }`
      (e.g. `homeUrl: {`, `link.target: {`) — both flattened to dotted keys.
- [x] Arrays `[ ... ]` whitespace-separated, spanning lines; the same property
      (templateOptions) appears both as scalar and as array.
- [x] Fenced code blocks as property values: `prop:` then ```lang ... ``` on
      following lines, dedented by fence indent. Langs seen: (none), sql,
      html, css, javascript. SQL/JS/CSS are embedded, NOT sibling files —
      except theme/static assets, which ARE native sibling files.
- [x] References `@local` and `@/standard-theme`.
- [x] STRUCTURAL: regions, pageItems, and buttons are SIBLINGS under the page;
      containment is via `layout.parentRegion: @ref` (region->region),
      `layout.region: @ref` (item/button->region), plus `layout.slot`.
      Projection resolves these; lexical nesting (docs style) also accepted.
- [x] Item label lives in a group: `label { label: X }`. Item source column:
      `source { column: X }` with `source.formRegion: @form` linkage.
- [x] Validation group holds `maxLength` etc.; NO required flag observed in
      this app — requiredness may be template-driven (@/required-floating) or
      a property not exercised here. OPEN until seen in another export.
- [x] Global page 0 exists with no alias; page files p00000-... zero-padded 5.
- [x] Package layout: application.apx, page-groups.apx, pages/, shared-
      components/ (with themes/ + static-files/ native assets), .apex/
      apexlang.json manifest ({"mmdVersion"}), deployments/default.json.


## Runtime verification (live 26.1 instance, spike run — VERIFIED facts)

- [x] Friendly URL = lowercased page alias appended to app base; page-level
      `authentication: public` serves with no redirect/session bounce (200).
- [x] pageItem identifiers map to the DOM VERBATIM: DOM node id equals the
      .apx identifier for every item type tested (textField, textarea,
      numberField, selectList, datePicker, hidden), and apex.item(id)
      setValue/getValue round-trips. This is the generator's item contract.
- [x] Page title at runtime differs from .apx title by invisible characters
      (dash/space variant). GENERATOR RULE: compare titles only after NFKC
      normalization + dash folding + whitespace collapse; never raw equality.
- [ ] OPEN (spike v3 in flight): region identifiers and button identifiers/
      buttonNames matched NO probed DOM convention (verbatim #id, R_ prefix,
      data-region-id, data-static-id, apex.region()). Note apex.region()
      misses are expected for staticContent/form (non-widget) regions. v3
      dumps ground truth: HTML occurrence + attribute location per region id,
      full page id inventory, and reverse-mapped button attributes by label.
      Do not design region/button selectors until that report lands.

## Still open

- [ ] Comment syntax: none observed anywhere. Assume none until spec says so.
- [ ] Quoting/escaping: no quoted strings observed. What happens when a value
      must contain a leading `[`/`@` or a literal ```? Unknown — needs a
      hostile fixture app.
- [ ] Whether components may legally appear inside `{ }` groups (parser
      tolerates; not observed).
- [ ] `required` property canonical name — build a form with a required item
      and re-export to confirm (`validation.valueRequired` is our guess).
- [ ] Casing rules; property-order significance (assumed none).
- [ ] Region/report types beyond this app (calendar, map, tree...); 18
      component types currently land in `unmodeled` — that list IS the
      typed-projection backlog: action, authentication, authorization, axis,
      breadcrumb, buildOption, column, componentSetting, dynamicAction, facet,
      facetGroup, file, list, lov, pageGroup, process, savedReport, series.

## Fixture policy

`test/fixtures/p00003-employee.apx` is hand-written docs-style (kept for the
lexically-nested variant). The real export is used by integration.test.ts via
a local path and is NOT committed — check redistribution terms before adding
any Oracle-authored export to the repo.
