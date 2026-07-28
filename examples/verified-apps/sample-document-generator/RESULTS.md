# sample-document-generator — verification results

Generated `@apx/testgen` output from a real app export, sparse-checked
out from Oracle's own [`github.com/oracle/apex`](https://github.com/oracle/apex)
repository, `26.1` branch, `sample-apps/` directory (UPL-1.0).
**The raw `.apx` export data is NOT included here** — only this project's
own derived tool output (generated Playwright specs + this results summary).
Unlike the original 13 Oracle sample-gallery apps in this directory, this
app's license is already fully resolved (UPL-1.0, confirmed directly from
the repository's own root `LICENSE.txt`) — the raw export is kept out for
consistency with the rest of this corpus's handling, not because of any
remaining licensing question. This app's export directory is named `sample-docgen` inside the
source repository, not `sample-document-generator` (the gallery-listing name) — the label used
here matches the gallery name for discoverability, per
`.ai/knowledge/verification.md`'s documented naming. See `.ai/knowledge/verification.md` for
the full reasoning.

## Parse

- **Warnings**: 0 (zero-warnings bar met)
- **Pages**: 4
- **Regions**: 15
- **Items**: 9
- **Buttons**: 2
- **Dynamic Actions**: 0

### Region types found
- `staticContent`: 11
- `dynamicContent`: 2
- `cards`: 1
- `classicReport`: 1

### Unmodeled component types
Real, present in this export, not yet typed at the parser level — preserved
in `raw` bags, nothing lost (ADR-001): `action`, `column`, `computation`, `pageGroup`, `process`

## Generation

`@apx/testgen` produced **3** page object + smoke spec pairs
(2 marked skip: auth required). See `generated/` for
the actual files.

## Determinism

Generated twice from the same export — byte-identical output, both times.
`apx-diff` self-diff (this export against itself):
**0 added, 0 removed, 0 changed, 3 unchanged** — confirms zero spurious differences.

## Live verification

**Live verification**: no running instance available for this app — static ground truth only (parser output, determinism, and structural findings above). No runtime claims are made about this app beyond what a live instance would be needed to confirm.
