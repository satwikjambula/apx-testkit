# Checklist: any change to `packages/parser`

Applies to a bug fix, a new typed field, extending an existing one, or
reviewing an existing one for correctness — not just new components.

- [ ] **Identify the specific component(s) actually relevant** to what's
      being touched — not necessarily all 40+ region/component types
      every time.
- [ ] **`curl` the raw EBNF file directly.** Never fetch it through an
      AI-summarizing tool — this has hallucinated syntax that doesn't
      exist in the real grammar before.
      `curl https://docs.oracle.com/en/database/oracle/apex/26.1/apxln/apexlang.ebnf`
- [ ] **Read the FULL production(s)** for the component(s) identified —
      every direct property AND every nested group — not a grep limited
      to the property names you already assume matter. A narrow check
      has missed a real bug before (`region.source.sql` reading the wrong
      raw key, only caught by a full page/region/item/button audit).
- [ ] **Cross-check against every real local `.apx` export.** Does real
      data confirm the EBNF's claim? Does it show something the EBNF is
      silent on, or contradicts? Real data wins when they disagree (ADR-004)
      — document the discrepancy rather than silently picking one side.
- [ ] **Write the fix/field** with a doc comment citing both the specific
      EBNF production checked and the real data that confirmed it
      (counts, example values, which real app).
- [ ] **If this touches `parseArray()`/`parseBody()`/the tokenizer
      itself**, be suspicious of off-by-one line-advance bugs — this has
      been a real, wide-reaching bug before (1550+ real occurrences of one
      shape silently dropping data). Write a test for the exact failure
      shape, confirm it fails without the fix.
- [ ] **Wire any new/changed typed field into `apx-diff`**
      (`packages/generator/src/diff.ts`) in this same change.
- [ ] **Add `vitest` regression tests** — the failing case, the passing
      case, and any type-gating condition.
- [ ] **Run the zero-warnings sweep** across every real local export.
- [ ] **Verify determinism** — regenerate
      `packages/generator/test/fixtures/reference-fixtures` and diff
      against committed `examples/employee-page`; must be byte-identical.
- [ ] **Record the finding** in `docs/grammar-assumptions.md` — what was
      checked, against which production(s), against which real data,
      what was found (confirmed / corrected / newly discovered).
