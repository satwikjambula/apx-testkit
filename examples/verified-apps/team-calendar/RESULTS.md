# team-calendar — verification results

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
- **Pages**: 51
- **Regions**: 176
- **Items**: 308
- **Buttons**: 280
- **Dynamic Actions**: 71

### Region types found
- `staticContent`: 93
- `classicReport`: 27
- `breadcrumb`: 17
- `interactiveReport`: 12
- `list`: 6
- `plugin/translatedMessage`: 6
- `plSqlDynamicContent`: 5
- `calendar`: 3
- `plugin/aclWarning`: 1
- `regionDisplaySelector`: 1
- `plugin/timelineAndStatusList`: 1
- `plugin/aclStatus`: 1
- `plugin/authorizationAdministration`: 1
- `plugin/tagCloud`: 1
- `listView`: 1

### Unmodeled component types
Real, present in this export, not yet typed at the parser level — preserved
in `raw` bags, nothing lost (ADR-001): `branch`, `column`, `columnGroup`, `computation`, `pageGroup`, `process`, `savedReport`, `validation`

## Generation

`@apx/testgen` produced **50** page object + smoke spec pairs
(49 marked skip: auth required). See `generated/` for
the actual files.

## Determinism

Generated twice from the same export — byte-identical output, both times.
`apx-diff` self-diff (this export against itself):
**0 added, 0 removed, 0 changed, 50 unchanged** — confirms zero spurious differences.

## Live verification

**Live verification**: no running instance available for this app — static ground truth only (parser output, determinism, and structural findings above). No runtime claims are made about this app beyond what a live instance would be needed to confirm.
