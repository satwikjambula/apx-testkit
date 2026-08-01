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
- [ ] **Cross-check against `Sawalhah/apexlang-view`'s independent parser**
      (`src/parser.js`, reference only -- read it on GitHub, NEVER add it
      as a dependency, NEVER import/require any of its code). It's a
      separately-authored parser for the same APEXlang format, validated
      by its own author against ~1,263 real exports -- roughly 90x this
      project's local corpus. Fetch the relevant section (e.g.
      `https://github.com/Sawalhah/apexlang-view/blob/main/src/parser.js`)
      and check: does it handle the construct being touched the same way?
      Confirmed convergent findings so far: the "fenced block may start on
      the following line, indented" quirk (matches this project's own
      `tryFence()` handling), and the `@/standard-theme` reference
      exclusion (matches `RefValue.standard` here). A DIVERGENCE is real
      signal worth investigating — either this project has a gap their
      larger corpus already caught, or they do. Their `looksLikeGarbage
      TypeName()`/`assessParseQuality()` heuristics are also worth reading
      for edge cases neither project has documented yet. This is a
      complementary, non-authoritative source (like the EBNF) — real
      local export data still wins when it disagrees with either.
- [ ] **Write the fix/field** with a doc comment citing both the specific
      EBNF production checked and the real data that confirmed it
      (counts, example values, which real app).
- [ ] **If this touches `parseArray()`/`parseBody()`/the tokenizer
      itself**, be suspicious of off-by-one line-advance bugs — this has
      been a real, wide-reaching bug before (1550+ real occurrences of one
      shape silently dropping data). Write a test for the exact failure
      shape, confirm it fails without the fix.
- [ ] **Wire any new/changed typed field into `apx-diff`**
      (`packages/generator/src/diff.ts`) in this same change. This is now
      automatically enforced, not just a manual reminder: this exact gap
      has happened twice before (`calendarSettings`, then
      `chartSettings`/`htmlDomId`), so
      `packages/generator/test/diff-field-coverage.test.ts` builds a
      fully-populated fixture per typed AST record and mutates every
      non-excluded own field one at a time, asserting `apx-diff` reports a
      change -- it fails loudly, by field name, the moment a new/changed
      typed field has no diff handling, with zero new test code required
      per field (data-driven off the fixture's own keys). Run
      `cd packages/generator && npx vitest run test/diff-field-coverage.test.ts`
      after adding the field to confirm it's picked up automatically.
- [ ] **Add `vitest` regression tests** — the failing case, the passing
      case, and any type-gating condition.
- [ ] **Run the zero-warnings sweep** across every real local export.
- [ ] **Verify determinism** — regenerate
      `packages/generator/test/fixtures/reference-fixtures` and diff
      against committed `examples/employee-page`; must be byte-identical.
- [ ] **Record the finding** in `docs/grammar-assumptions.md` — what was
      checked, against which production(s), against which real data,
      what was found (confirmed / corrected / newly discovered).
