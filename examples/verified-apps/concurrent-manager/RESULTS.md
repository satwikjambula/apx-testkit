# concurrent-manager — verification results

Generated `@apx/testgen` output from a real app export authored by this
project's own user — **the best-provenance app in this corpus**. Unlike
every other app in `examples/verified-apps/`, there is **no licensing
question of any kind** here: it's the user's own application, so there is
no redistribution-rights question to track in `docs/license-check.md`,
no third-party `LICENSE` file to check, nothing deferred. **The raw
`.apx` export data is still NOT included here** — only this project's own
derived tool output (generated Playwright specs + this results summary) —
for consistency with the rest of this corpus's handling (every other app
here also withholds its raw export, for a mix of reasons; this is the one
entry where that withholding is a pure consistency choice, not driven by
any licensing caution at all).

Confirmed genuine `mmdVersion 26.1.0+3102` before adding (`.apex/apexlang.json`).

## Parse

- **Warnings**: 0 (zero-warnings bar met)
- **Pages**: 56
- **Regions**: 159
- **Items**: 217
- **Buttons**: 67
- **Dynamic Actions**: 46

### Region types found
- `breadcrumb`: 42
- `staticContent`: 39
- `interactiveGrid`: 29
- `interactiveReport`: 16
- `classicReport`: 12
- `form`: 7
- `chart`: 4
- `cards`: 4
- `regionDisplaySelector`: 4
- `dynamicContent`: 2

No genuinely new region type — all 10 types above were already present in
the 45-app corpus before this addition.

### Unmodeled component types
Real, present in this export, not yet typed at the parser level — preserved
in `raw` bags, nothing lost (ADR-001): `axis`, `branch`, `column`, `pageGroup`, `process`, `savedReport`, `series`, `validation`

All 8 were already known unmodeled types from earlier apps in the corpus —
no new unmodeled component type surfaced here either.

### Item types found
- `textField`: 64
- `hidden`: 49
- `numberField`: 27
- `selectList`: 22
- `datePicker`: 15
- `textarea`: 13
- `switch`: 11
- `displayOnly`: 5
- `radioGroup`: 4
- `popupLov`: 2
- `checkboxGroup`: 1
- `richTextEditor`: 1
- `markdownEditor`: 1
- `password`: 1
- `checkbox`: 1

All 15 item types above were already present in the corpus before this
app. No new item type.

### Custom item plugin — checked, contributes no analyzable signal

This export ships one custom item plugin,
`shared-components/plugins/item/advancedSlider` (static id
`HR.BILOG.MGORICKI.ADVANCED_SLIDER`, a jQuery UI slider wrapper). It was
specifically checked for — a real, present custom plugin is exactly the
kind of thing this checklist calls out as "real signal for what to check
next" — but a full grep of every `pages/*.apx` file for
`ADVANCED_SLIDER`/`advancedSlider` found **zero page items reference it
anywhere in this export**. The plugin is defined in `shared-components/`
but never placed on any page. It therefore contributes no `plugin/*`
item-type instance to this app's parse output (confirmed: no
`plugin/HR.BILOG.MGORICKI.ADVANCED_SLIDER`-style type appears in any of
this app's 217 items). Separately, and true for every app in this corpus,
not something new here: `shared-components/**` (plugin definitions,
themes, static files) is outside `@apx/generator`'s `loadExport()` scope
entirely (`application.apx` + `page-groups.apx` + `pages/*.apx` only) —
so even if the plugin *had* been placed on a page, its own `plugin.apx`
definition would not itself be parsed by this pass; only the resulting
`pageItem ( type: plugin/... )` reference on whichever page used it would
be.

## ADR-003 (`htmlDomId`) cross-check

Checked specifically, per the new-app checklist. `htmlDomId` is present
on 17 of this app's 159 regions, across 4 region types — `staticContent`
(7/39), `interactiveReport` (4/16), `interactiveGrid` (5/29),
`dynamicContent` (1/2). All 4 types were already confirmed to carry
`htmlDomId` elsewhere in the corpus before this app. **Nothing here
contradicts ADR-003's "universal mechanism, not gated to specific
region types" finding — it's a small additional corroboration, not a new
divergence.** Static-only confirmation, as with the rest of this app (no
live instance — see below): this confirms `htmlDomId` is *set* in the
export, not that it resolves live for this specific app.

## Generation

`@apx/testgen` produced **55** page object + smoke spec pairs
(54 marked skip: auth required; the global page, id 0, is excluded from
generation by design, same as every other app in this corpus — 56 parsed
pages, 55 generated pairs). See `generated/` for the actual files.

## Determinism

Generated twice from the same export — byte-identical output, both times.
`apx-diff` self-diff (this export against itself):
**0 added, 0 removed, 0 changed, 55 unchanged** — confirms zero spurious differences.

## Live verification

**Live verification**: no running instance available for this app —
static ground truth only (parser output, determinism, and structural
findings above). The export's own `deployments/default.json` records only
an app id (`20500`), no reachable instance URL — checked directly rather
than assumed, per this task's explicit instruction not to assume
static-only status. No runtime claims are made about this app beyond what
a live instance would be needed to confirm.
