# world-diner — verification results

Generated `@apx/testgen` output from a real, independently-authored app export
(`ujnak/APEXlang-exports` (MIT), cloned from
[`github.com/ujnak/APEXlang-exports`](https://github.com/ujnak/APEXlang-exports)).
**The raw `.apx` export data is NOT included here** — only this project's own
derived tool output (generated Playwright specs + this results summary). Unlike
the original 13 Oracle sample-gallery apps in this directory, this app's
license is already fully resolved (MIT, confirmed directly from the source
repository's own `LICENSE` file) — the raw export is kept out for
consistency with the rest of this corpus's handling, not because of any
remaining licensing question. See `.ai/knowledge/verification.md` for the
full reasoning.

## Parse

- **Warnings**: 0 (zero-warnings bar met)
- **Pages**: 3
- **Regions**: 3
- **Items**: 6
- **Buttons**: 2
- **Dynamic Actions**: 0

### Region types found
- `staticContent`: 2
- `classicReport`: 1

### Unmodeled component types
Real, present in this export, not yet typed at the parser level — preserved
in `raw` bags, nothing lost (ADR-001): `column`, `pageGroup`, `process`

## Generation

`@apx/testgen` produced **2** page object + smoke spec pairs
(1 marked skip: auth required). See `generated/` for
the actual files.

## Determinism

Generated twice from the same export — byte-identical output, both times.
`apx-diff` self-diff (this export against itself):
**0 added, 0 removed, 0 changed, 2 unchanged** — confirms zero spurious differences.

## Live verification

**Live verification**: no running instance available for this app — static ground truth only (parser output, determinism, and structural findings above). No runtime claims are made about this app beyond what a live instance would be needed to confirm.
