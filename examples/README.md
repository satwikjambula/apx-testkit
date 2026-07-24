# Examples

`employee-page/` is real `@apx/testgen` output — not hand-edited, not
mocked — generated from the committed synthetic fixture at
`packages/generator/test/fixtures/reference-fixtures` (a hand-written `.apx` page,
safe to commit; see docs/grammar-assumptions.md "Fixture policy" for why
real Oracle-authored exports are never committed here).

`verified-apps/` is the same idea at larger scale: generated output +
results summaries from 13 real Oracle sample apps this project has used
for verification, without committing any raw Oracle export data — see
`verified-apps/README.md` for what's there and why the raw exports are
deliberately excluded.

This is here so you can read what the generator produces without installing
anything or having an APEX export of your own. It reflects the CURRENT
generator template (page object + smoke spec, both built on `@apx/testkit`)
— unlike `spike/tests-generated/`, which predates the page-object split and
is flagged stale in the README until someone with real export access
regenerates it.

To regenerate this example yourself:

    node packages/generator/dist/cli.js packages/generator/test/fixtures/reference-fixtures --out examples/employee-page

Note these files import `../playwright.config.js`, which doesn't exist in
`examples/` — that's expected. They're meant to be read, not run from here;
`spike/` is the runnable project where that config lives.
