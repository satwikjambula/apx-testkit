# Limitations

Honest list of what this toolkit does not cover today. If you hit one of
these, it's a known gap, not a bug — but please file an issue anyway if the
workaround isn't obvious; that's exactly the signal M4 needs.

## Page types / DOM patterns

- **Drawer/modal pages (e.g. `pageMode: modalDialog`) don't load via a plain
  friendly-URL GET.** Confirmed live: p00420 (Data Entry — Drawer Form)
  returns 400 on direct navigation. These pages need a parent-page/dialog
  context this generator doesn't construct. Generated tests for such pages
  will fail until this is addressed — that's expected, not a regression.
- **Faceted search / Interactive Grid pages are untested.** The plan
  deliberately excludes Interactive Grid deep interaction (cell editing) for
  v0.2+; faceted search regions haven't been exercised at all.
- **Region assertions don't exist.** The region identifier -> DOM convention
  is still an open ledger item (see docs/grammar-assumptions.md "Still
  open") — no selector guess has been committed. `@apx/testkit`'s
  `probeRegions()`/`refreshRegion()` only report what apex.region()'s own
  widget API resolves, which is known to miss non-widget regions
  (staticContent, form).
- **Button assertions use accessible-role/label locators, not a verified
  static-id convention.** Works today for ordinary labeled buttons; not
  verified for icon-only buttons or heavily template-customized ones.

## Item coverage

- **`required` item behavior is unmodeled.** No required item exists in the
  ground-truth app used so far, so the generator can't yet assert "required
  items reject empty submit" as the original plan describes.
- Item *types* not seen in the ground-truth app (calendar pickers, rich text,
  map regions, etc.) parse into `raw` bags rather than typed fields — see the
  `unmodeled` list the generator/parser print.

## Authentication

- **`auth.ts`'s login fixture is implemented but unverified.** Every
  ground-truth page used so far is `authentication: public`. Pages requiring
  login are emitted as `test.describe.skip()`. If you have an app with a
  real login page, running against it (and reporting what breaks) is one of
  the highest-value things you could do for this project right now.

## Generator

- **Determinism is proven against a hand-written synthetic fixture**
  (`packages/generator/test/fixtures/mini-export`), not the actual
  multi-page UX Pattern Catalog export — that export isn't committed
  (redistribution rights unchecked) and wasn't available in every
  environment this project has been developed in. `spike/tests-generated/`
  may lag the current generator template until someone with real export
  access regenerates it.
- **No page-object/spec support for Interactive Report search, pagination,
  or Interactive Grid** — an `ir.ts` component was deliberately not built;
  there's no verified DOM contract for it yet.
- **Data-dependent assertions are out of scope, permanently, by design** —
  the generator has no way to know what data your instance holds.

## Grammar / parser

- Comment syntax, string quoting/escaping edge cases, and property-order
  significance are all unverified assumptions (assumed "none" until proven
  otherwise) — see docs/grammar-assumptions.md "Still open".
- Verified against exactly one application. A second, independently-sourced
  export is needed before any of the "verified" claims in this repo should
  be trusted beyond that one app — see docs/support-matrix.md.
