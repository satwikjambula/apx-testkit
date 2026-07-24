# Checklist: adding or extending a runtime API on an existing component

Use this when the component/wrapper already exists (`ApexRegion`,
`ApexCardsRegion`, `ApexChartRegion`, etc.) and you're adding a new
method, or re-investigating a method's behavior.

- [ ] **Identify the real dispatch path first.** Direct
      `apex.region(id)[method]()`, or widget-factory
      `apex.region(id).widget().<widgetName>(method, ...)`? Don't assume
      it matches a sibling component — Interactive Report/Cards use the
      direct path; Interactive Grid/Chart use widget-factory.
- [ ] **Call it live, against a real running instance, and check the
      actual return value** — not just "it didn't throw." Use an
      explicit `=== null`/`typeof` check, not a truthy check, when the
      question is specifically "does this return null."
- [ ] **Try it on more than one instance of the component type** before
      generalizing a finding project-wide. A finding based on one region
      tested once has been wrong before in this exact project (Chart's
      `widget()` claim) — three independent examples is the bar this
      project has actually used.
- [ ] **If it's a getter/setter-shaped widget**, check for the standard
      jQuery UI widget-factory `option` method before assuming a
      bespoke accessor name — `getProperty`/`getOption` were plausible
      guesses that turned out to be confirmed-invalid; `option` was the
      real one.
- [ ] **Confirm setters actually persist within the session** — a
      round-trip get → set → get should reflect the new value, and (for
      widget-factory setters) the call should return the widget for
      chaining if that's the documented convention.
- [ ] **Watch for initialization races.** If the widget attaches
      asynchronously (JET components can), test calling the method
      immediately after navigation, not just after a manual pause — add a
      `page.waitForFunction` precondition wait if it races, and document
      the race in `docs/quirks/26.1.json`, not just fix it silently.
- [ ] **Record the finding in `docs/quirks/26.1.json`** regardless of
      outcome — working, broken, or "no such method." A confirmed-invalid
      method name is exactly as valuable to record as a working one; it
      stops the next person (or agent) from re-trying it.
- [ ] **Implement the wrapper method** using only the confirmed path.
- [ ] **Add a live spike spec assertion** exercising the new method
      against the real app.
- [ ] **Update `docs/support-matrix.md`** (what this was verified
      against, how) and `docs/component-coverage-matrix.md`/`README.md`
      if the component's overall status changed.
- [ ] If this corrects an earlier wrong claim: **correct it in place,
      visibly** — rewrite the existing `quirks.json` entry to state the
      correction with the new evidence, don't delete and silently
      replace it (ADR-004).
