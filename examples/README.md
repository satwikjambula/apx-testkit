# Examples

`employee-page/` is real `@apx/testgen` output — not hand-edited, not
mocked — generated from the committed synthetic fixture at
`packages/generator/test/fixtures/mini-export` (a hand-written `.apx` page,
safe to commit; see docs/grammar-assumptions.md "Fixture policy" for why
real Oracle-authored exports are never committed here).

This is here so you can read what the generator produces without installing
anything or having an APEX export of your own. It reflects the CURRENT
generator template (page object + smoke spec, both built on `@apx/testkit`)
— unlike `spike/tests-generated/`, which predates the page-object split and
is flagged stale in the README until someone with real export access
regenerates it.

To regenerate this example yourself:

    node packages/generator/dist/cli.js packages/generator/test/fixtures/mini-export --out examples/employee-page

Note these files import `../playwright.config.js`, which doesn't exist in
`examples/` — that's expected. They're meant to be read, not run from here;
`spike/` is the runnable project where that config lives.
