# Checklist: adding support for a new region/component type

Use this for a component type that currently has no typed AST field, no
runtime wrapper, and no generator support — e.g. what Calendar, Chart, and
Interactive Grid each went through. Skip steps that don't apply (a
parser-only field with no runtime story yet, per ADR-002, is a valid
stopping point — see `.ai/checklists/parser-change.md` alone for that).

- [ ] **Parse metadata.** Confirm the component's raw properties already
      land in `raw` bags without crashing (they should — the tokenizer is
      generic). If not, that's a tokenizer bug, not a missing feature.
- [ ] **Check the full relevant EBNF production(s).** `curl` the raw
      grammar (never WebFetch — see DESIGN_GUARDRAILS.md), read every
      property/group in the component's production(s), not just what you
      already assume matters.
- [ ] **Cross-check against real export data.** Search every real local
      export for this component type. Confirm the EBNF's claims (or find
      where it's silent/wrong) against what real apps actually contain.
- [ ] **Add the semantic AST projection.** Type only fields with clear,
      direct testing/diffing value — leave purely cosmetic properties
      (fonts, colors, positions) in `raw`, and say so explicitly in the
      doc comment as a deliberate scope decision.
- [ ] **Preserve raw metadata.** The typed field is additive — `raw` keeps
      everything, always (ADR-001).
- [ ] **Wire into `apx-diff`.** Add the new field to the relevant
      `diff*Fields()` function in `packages/generator/src/diff.ts` in this
      same change — do not defer this.
- [ ] **Add parser regression tests** (`vitest`) covering: the field
      populated, the field absent/defaulted, and — if type-gated (like
      `calendarSettings`/`chartSettings`) — that it stays `null` for
      non-matching region types.
- [ ] **Run the zero-warnings sweep** across every real local export, and
      the determinism check against `examples/employee-page`.
- [ ] **If runtime behavior is in scope**: does a real running instance
      exist? If not, stop here — ship a specific `UnsupportedComponentError`
      stub in `unsupported.ts` with a current, accurate reason (ADR-002).
      If yes:
  - [ ] **Verify the actual dispatch path live** — does
        `apex.region(id).widget()` return something? Is it a direct
        `region[method]()` shape or a widget-factory shape
        (`.widget().someMethod(method, ...)`)? Try the standard
        widget-factory `option` getter/setter before assuming a bespoke
        API is needed (see `.ai/knowledge/oracle-apex.md`).
  - [ ] **Confirm the runtime static id resolution** — check
        `ApexRegion.htmlDomId` first (ADR-003) before assuming live DOM
        inspection is required.
  - [ ] **Implement the runtime wrapper** in `packages/testkit`, using
        only confirmed-working methods. Remove the corresponding stub
        from `unsupported.ts`, replacing it with a short "graduated"
        comment pointing at the real class.
  - [ ] **Record findings in `docs/quirks/26.1.json`** — evidence,
        `reproducedAgainst`, workaround, `rootCauseDiagnosed`.
  - [ ] **Add a live spike spec** (`spike/tests/*.spec.ts`), gated on
        `APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD`, and actually
        run it against the real app before considering this done.
- [ ] **Add generator support** if the runtime id is reliably resolvable
      (ADR-003 layer 1 or 2) — otherwise document that auto-wiring isn't
      possible and why.
- [ ] **Update documentation together**: `docs/ecosystem-roadmap.md`,
      `docs/component-coverage-matrix.md`, `README.md`'s capability
      matrix, `docs/tutorial.md` (a new numbered section, mirroring the
      most recent graduated component's section). Fix any older entries
      elsewhere in these files that made a now-superseded claim — in
      place, visibly, not silently.
- [ ] **Full verification pass** before committing (see
      `.ai/knowledge/verification.md`'s regression sweep).
