# ADR-003: Region resolution uses a layered strategy, never a guess

## Status
Accepted

## Context
A region's `.apx` export identifier does not always equal the runtime
static id that `apex.region()` actually resolves. First confirmed on
Interactive Grid (export `basic-editing` → runtime `emp`) and Chart
(export `pie-chart` → runtime `pie1`, among others). The root cause was
diagnosed on 2026-07-24: the export's `region { advanced { htmlDomId:
... } } }` property, when present, deterministically predicts the
runtime id — `apex.region(htmlDomId)` resolves directly, no suffix.

**Correction (same day, later pass)**: this was initially believed to be
narrower — "Interactive Report/Cards/Faceted Search/form/static regions
have matched [export id to runtime id] in every app checked so far." That
claim was wrong, based on incomplete sampling, and is corrected in place
here rather than silently. A real `interactiveReport` region
(`sample-charts`, export identifier `projects`) has `advanced { htmlDomId:
projects_report }` — confirmed live: `apex.region('projects')` → `false`;
`apex.region('projects_report')` → `true`. **`htmlDomId` is a universal
region-level mechanism, not gated to Chart/Interactive Grid** — a full
sweep of the 13-app local corpus found it set on 6/86 (~7%) of
`interactiveReport`/`cards`/`facetedSearch` regions too (5 IR, 1 Cards, 0
Faceted Search in that sample). The remaining ~93% have no `htmlDomId`
and their export identifier IS the runtime id — a real, common case, but
a majority pattern to fall back to, not a guaranteed one to assume.

Separately, and only for Chart/Interactive Grid specifically: those two
components' OWN internal widget-factory dispatch (`chart.ts`,
`interactive-grid.ts`) needs a second, nested id — the JET/IG widget's
own DOM container, one level below the region `apex.region(id)` itself
resolves — confirmed as `<htmlDomId-or-identifier>_jet` /
`_ig` respectively. This suffix is specific to those two components'
internal implementation; it is not part of generic `apex.region(id)`
resolution, which uses the bare id at every layer.

## Decision
Resolving a region's runtime id (the bare id `apex.region()` itself
resolves — before any widget-specific suffix a particular component may
need internally) is a layered lookup, attempted in this order for **any**
region type, and the layer that succeeds must be stated explicitly —
never silently assumed:
1. If `ApexRegion.htmlDomId` is set, the runtime id is `htmlDomId`,
   verbatim — confirmed directly resolvable via `apex.region()` for
   Chart, Interactive Grid, and Interactive Report alike; treat this as
   universal, not per-type.
2. Otherwise, the export identifier itself is the runtime id — true for
   the large majority of regions checked (~93% of IR/Cards/Faceted
   Search in the local corpus; effectively all of `form`/`staticContent`
   checked so far), but a fallback assumption per-instance, not a
   category-wide guarantee — a new counter-example on any region type
   would not be surprising and should be checked, not dismissed.
3. Otherwise, this cannot be resolved from static `.apx` data at all — it
   requires live DOM discovery, and the code must say so explicitly
   (`interactive-grid.ts` and `chart.ts` both throw a specific, named
   error rather than silently constructing a wrong locator) rather than
   guessing.

For Chart/Interactive Grid specifically, their own widget-factory
dispatch additionally appends `_jet`/`_ig` to whichever id layer 1 or 2
above resolved, to reach the nested widget container — this is an
extra, component-specific step on top of the above, not a replacement
for it.

## Consequences
- `@apx/testgen`'s generator can auto-wire a region only when layer 1 or 2
  applies. It must not fall through to a guess for layer 3 — an
  unconstructible component is a documented gap, not a best-effort
  locator.
- Layer 2 (export identifier as fallback) must be treated as a real
  assumption with a known ~7% failure rate on this project's own corpus,
  not an assumed guarantee — any auto-generated assertion using it should
  be understood as "usually right," and a live failure should prompt
  checking `htmlDomId` before assuming a new, unrelated bug.
- Any new region type discovered to diverge (export id ≠ runtime id)
  should be checked against `htmlDomId` first before treating it as a new,
  separate mystery — confirmed, twice now, to be the same universal
  mechanism, not a new phenomenon per widget type.
- `docs/quirks/26.1.json`'s `region-id-not-static-id` entry is the
  single source of truth for this pattern across all region types; new
  divergences get added there, not scattered into per-component comments
  only.
