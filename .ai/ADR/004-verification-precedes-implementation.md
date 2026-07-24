# ADR-004: Verification precedes implementation

## Status
Accepted

## Context
This project has twice shipped a wrong "confirmed" claim on the exact
same feature area (Chart's `apex.region(id).widget()` behavior — first
claimed `null`, later found to return a real object) and once shipped a
silent, wide-reaching parser bug (`parseArray()` dropping the first
element of any array whose `[` had nothing inline on its property line —
confirmed present **1550+ times** across every real export this project
had parsed, meaning `#DEFAULT#` had been silently missing from parsed
data project-wide the whole time). Neither was found by design review;
both were found by re-testing against real evidence — live re-verification
for the first, a fuller EBNF/data cross-check for the second. Separately,
an AI-summarized fetch of Oracle's own APEXlang EBNF page hallucinated a
`@{component-id}` reference syntax that does not exist anywhere in the
real grammar — confirmed by fetching the raw `.ebnf` file directly.

## Decision
No runtime capability, parser field, or documented behavior may be
marked "confirmed"/"verified" without one of two evidence sources:
- **Runtime claims**: live evidence against a real, running Oracle APEX
  26.1+ instance, observed directly (see ADR-002).
- **Parser/grammar claims**: real parsed export data from an actual
  Oracle `.apx` export, cross-checked against the **full relevant
  production(s)** in Oracle's official APEXlang EBNF grammar
  (`docs.oracle.com/en/database/oracle/apex/26.1/apxln/apexlang.ebnf`) —
  fetched via `curl` directly to a raw file, **never** through an
  AI-summarizing fetch tool, and never a narrow check of only the fields
  already assumed to matter.

A claim sourced from documentation prose, a method name's plausibility,
or memory of an earlier session is a hypothesis, not a fact, until one of
the above confirms or refutes it. When the official EBNF and real,
live-parsed export data disagree, or the EBNF is silent on something
confirmed live/in real data, **real data wins** — the discrepancy gets
documented, not silently resolved by picking whichever source is more
convenient.

## Consequences
- Every new component/field ships with either a `reproducedAgainst` +
  `evidence` entry in `docs/quirks/26.1.json` (runtime) or a cross-check
  note in `docs/grammar-assumptions.md` citing the specific EBNF
  production(s) checked (parser).
- A claim later proven wrong is corrected **in place, visibly** — the
  entry stays, annotated as corrected, with the new evidence — never
  silently deleted or rewritten without a trace (see
  `chart-region-widget-returns-null`).
- "It compiles / it typechecks" is necessary but never sufficient. Every
  change also requires: the relevant test suite green, a determinism
  check against `examples/employee-page` (byte-identical regeneration),
  and a zero-warnings sweep across every real `.apx` export this project
  has access to, before being considered done.
