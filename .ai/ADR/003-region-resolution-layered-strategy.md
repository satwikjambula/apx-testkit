# ADR-003: Region resolution uses a layered strategy, never a guess

## Status
Accepted

## Context
A region's `.apx` export identifier does not always equal the runtime
static id that `apex.region()` and the widget container element actually
use. Confirmed on Interactive Grid (export `basic-editing` → runtime
`emp`) and Chart (export `pie-chart` → runtime `pie1`, among others) —
but Interactive Report/Cards/Faceted Search/form/static regions have
matched in every app checked so far. The root cause was diagnosed on
2026-07-24: the export's `region { advanced { htmlDomId: ... } } }`
property, when present, deterministically predicts the runtime id
(`<htmlDomId>_jet` for Chart, `<htmlDomId>_ig` for Interactive Grid).
Confirmed exactly across multiple regions of both types. When `htmlDomId`
is absent — true for 66/97 real chart regions in Oracle's own "Sample
Charts" app — the runtime id is an APEX-internal auto-generated numeric
id (e.g. `R738095923010136870`) with **no corresponding field anywhere in
the static export**, confirmed via an exact region-count-to-hash-id
correspondence.

## Decision
Resolving a region's runtime id is a layered lookup, attempted in this
order, and the layer that succeeds must be stated explicitly — never
silently assumed:
1. If `ApexRegion.htmlDomId` is set, the runtime id is
   `<htmlDomId>_<widget-suffix>` (`_jet` for Chart, `_ig` for Interactive
   Grid — confirmed suffixes; other widget types may use a different one,
   not yet confirmed).
2. Otherwise, for region types confirmed to match export identifier to
   runtime id in every app checked (Interactive Report, Cards, Faceted
   Search, form, static), the export identifier itself is the runtime id.
3. Otherwise, this cannot be resolved from static `.apx` data at all — it
   requires live DOM discovery, and the code must say so explicitly
   (`interactive-grid.ts` and `chart.ts` both throw a specific, named
   error rather than silently constructing a wrong locator) rather than
   guessing.

## Consequences
- `@apx/testgen`'s generator can auto-wire a region only when layer 1 or 2
  applies. It must not fall through to a guess for layer 3 — an
  unconstructible component is a documented gap, not a best-effort
  locator.
- Any new region type discovered to diverge (export id ≠ runtime id)
  should be checked against `htmlDomId` first before treating it as a new,
  separate mystery — the mechanism is now understood and is very likely
  the same one, not a new phenomenon per widget type.
- `docs/quirks/26.1.json`'s `region-id-not-static-id` entry is the
  single source of truth for this pattern across all region types; new
  divergences get added there, not scattered into per-component comments
  only.
