# ADR-002: Never wrap an Oracle API without live verification

## Status
Accepted

## Context
Runtime capabilities in `packages/testkit` are built on two kinds of
Oracle surface: documented APEX JS APIs (`apex.region()`, `apex.item()`,
`apex.message`) and jQuery UI widget-factory calls reached through them
(`apex.region(id).widget().interactiveGrid(method)`,
`.ojChart(method, ...)`). Both categories have produced real, costly
surprises when assumed rather than tested:
- `ApexCardsRegion.getRecords()`/`getModel()` exist on the widget's method
  list and throw a runtime `TypeError` instead of returning data
  (`docs/quirks/26.1.json` `cards-getrecords-broken`).
- `apex.region(id).widget()` was claimed to return `null` for Chart
  regions based on testing exactly one region once — re-tested later and
  found false on three independent chart types, corroborated by the
  target app's own exported JS calling that exact path directly
  (`chart-region-widget-returns-null`, corrected in place).
- `getProperty`/`getOption` are real-looking, plausible method names on
  `ojChart` that throw "no such method" — a name existing in Oracle's own
  minified source or being intuitively named is not evidence it works.

## Decision
A runtime wrapper method may only be added to `packages/testkit` once it
has been called against a real, running Oracle APEX 26.1 instance and
its behavior observed directly — never inferred from Oracle's
documentation prose alone, never guessed from a method's presence in
minified source, and never assumed to generalize from a single call on a
single region. Method names confirmed to throw "no such method" are
recorded as confirmed-invalid and must not be retried without new
evidence changing the picture.

## Consequences
- Every runtime capability in `packages/testkit` ships with a
  `reproducedAgainst` entry (the real app + page/region used) and literal
  `evidence` in `docs/quirks/26.1.json` — not "this should work per the
  Oracle docs."
- A capability with rich *static* ground truth (real parsed export data)
  but zero live access stays an explicit `UnsupportedComponentError` stub
  in `packages/testkit/src/components/unsupported.ts` — e.g. Calendar has
  21 real regions parsed and typed (`ApexRegion.calendarSettings`) but is
  still a stub, because no live instance has been available to verify
  `apex.region(id).widget()`'s actual behavior for that widget type.
- A wrong "confirmed" finding is corrected *in place, visibly* the moment
  new evidence contradicts it (see `chart-region-widget-returns-null`) —
  never silently deleted or quietly re-written without acknowledging the
  correction.
