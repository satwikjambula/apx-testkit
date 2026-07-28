# customers — verification results

Generated `@apx/testgen` output from a real app export, sparse-checked
out from Oracle's own [`github.com/oracle/apex`](https://github.com/oracle/apex)
repository, `26.1` branch, `starter-apps/` directory (UPL-1.0).
**The raw `.apx` export data is NOT included here** — only this project's
own derived tool output (generated Playwright specs + this results summary).
Unlike the original 13 Oracle sample-gallery apps in this directory, this
app's license is already fully resolved (UPL-1.0, confirmed directly from
the repository's own root `LICENSE.txt`) — the raw export is kept out for
consistency with the rest of this corpus's handling, not because of any
remaining licensing question. See `.ai/knowledge/verification.md` for
the full reasoning.

## Parse

- **Warnings**: 0 (zero-warnings bar met)
- **Pages**: 127
- **Regions**: 375
- **Items**: 838
- **Buttons**: 636
- **Dynamic Actions**: 163

### Region types found
- `staticContent`: 158
- `breadcrumb`: 58
- `interactiveReport`: 49
- `classicReport`: 39
- `list`: 17
- `chart`: 10
- `plugin/badgeList`: 8
- `plSqlDynamicContent`: 7
- `plugin/tagCloud`: 5
- `regionDisplaySelector`: 5
- `calendar`: 4
- `plugin/translatedMessage`: 4
- `plugin/html5BarChart`: 3
- `plugin/aclStatus`: 1
- `plugin/authorizationAdministration`: 1
- `plugin/completeness`: 1
- `plugin/miniCalendar`: 1
- `plugin/validateContent`: 1
- `plugin/aclWarning`: 1
- `listView`: 1
- `interactiveGrid`: 1

### Unmodeled component types
Real, present in this export, not yet typed at the parser level — preserved
in `raw` bags, nothing lost (ADR-001): `axis`, `branch`, `column`, `computation`, `pageGroup`, `process`, `savedReport`, `series`, `validation`

## Generation

`@apx/testgen` produced **126** page object + smoke spec pairs
(123 marked skip: auth required). See `generated/` for
the actual files.

## Determinism

Generated twice from the same export — byte-identical output, both times.
`apx-diff` self-diff (this export against itself):
**0 added, 0 removed, 0 changed, 126 unchanged** — confirms zero spurious differences.

## Live verification

**Live verification**: no running instance available for this app — static ground truth only (parser output, determinism, and structural findings above). No runtime claims are made about this app beyond what a live instance would be needed to confirm.
