# Oracle APEX concepts this project reasons about

## The structural hierarchy

```
Application
  |
  +-- Pages
        |
        +-- Regions              (form, interactiveReport, interactiveGrid,
        |     |                    cards, chart, calendar, tree, map, ...)
        |     |
        |     +-- Items          (page-level items also exist, not owned
        |     +-- Buttons          by a region)
        |     +-- Columns         (row-level, seen inside e.g. classicReport)
        |
        +-- Dynamic Actions      (when { trigger } -> clientSideCondition?
        |                         -> actions[] true/false lists)
        |
        +-- Processes            (server-side; not yet typed in the AST)
        +-- Branches             (navigation; not yet typed in the AST)

Shared Components                (themes, plugins, LOVs, auth schemes —
                                   referenced via `@name` / `@/standard`)
```

`@apx/parser` currently types Pages/Regions/Items/Buttons/Dynamic
Actions fully. Processes, branches, LOVs, and server-side validations
fall into `raw`/`unmodeled` — real, present in exports, not yet a typed
AST concern (see `docs/ecosystem-roadmap.md` for the honest gap list).

## Region identity: two different ids that usually, but not always, match

- The **`.apx` export identifier** — the developer-facing name after
  `region <identifier> (`.
- The **runtime region id** — what `apex.region(id)` and the widget's DOM
  container actually use.

These match for Interactive Report/Cards/Faceted Search/form/static in
every app checked. They can diverge for Interactive Grid and Chart — see
ADR-003 for the full mechanism (`advanced { htmlDomId: ... }`).

## The widget-factory dispatch pattern

Some region types (Interactive Grid, Chart) are not driven through direct
methods on the `apex.region(id)` object the way Interactive Report/Cards
are. Instead: `apex.region(id).widget()` returns a jQuery-wrapped element,
and the actual methods live behind a jQuery UI widget-factory call on
that element — `.interactiveGrid(method, ...args)` for IG,
`.ojChart(method, ...args)` for Chart. The standard widget-factory
`option` method (present on `ojChart`, likely present on other JET
widgets) is both a getter (`option()` for the full config, `option(key)`
for one property) and a setter (`option(key, value)`), returning the
widget itself for chaining. This is a generic jQuery UI convention, not
an APEX-specific one — worth checking for on any future widget-factory
component before assuming a bespoke API is needed.

## `pageAccessProtection: argumentsMustHaveChecksum`

A real, correctly-functioning APEX security feature that several sample
apps enable. A bare `page.goto()` to a friendly URL — even immediately
after a successful login, even to the exact page just landed on —
silently redirects to `/login` (HTTP 200, not an error) because the
request lacks a valid per-render checksum that only APEX's own rendered
links carry. Navigate via real in-app link clicks
(`page.getByRole('link', ...).click()`) on apps/pages with this enabled,
not `page.goto()` — this is not a workaround for a bug, it's respecting
a real security control.

## JET (Oracle JavaScript Extension Toolkit) widgets

Chart regions render via Oracle JET's `oj-chart` custom element, attached
to a container with id convention `<runtime region id>_jet`. JET widgets
can initialize **asynchronously**, after `domcontentloaded` fires — code
that calls a widget-factory method immediately after navigation can race
this (see `chart-widget-initialization-race` in
`docs/quirks/26.1.json`); wait for the actual precondition
(`typeof apex.region(id)?.widget?.()?.ojChart === 'function'`) rather
than a fixed delay.
