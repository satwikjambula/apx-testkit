# Change-based test planning

`apx-select <baseline-export-dir> <current-export-dir>` prints a deterministic
JSON impact plan. The library equivalent is `planTestSelection` from
`@apx/testgen/selection`. Both require canonical APEX 26.1 exports.

The plan identifies directly changed/added pages and their generated spec
filenames, explains each candidate, lists current generated specs, and lists
obsolete generated specs after page removal or alias changes. It does not
generate, delete, run, or skip tests. Exit 0 means a plan was produced, not
that tests passed; invalid exports exit 1 and invalid CLI arguments exit 2.

## Safety boundary

**Default planning is advisory, not reduced-suite execution.** The base plan
sets `execution: "full-suite"`. Run the full configured Playwright suite,
including hand-written tests; `currentGeneratedSpecs` is only the generated
inventory, not an exhaustive suite. `candidates` must not be used as an
execution allowlist. The AST does not establish complete cross-page, shared
code, database or hand-written-test dependencies. Proving those dependencies
requires explicit reviewed contracts, not an implicit assumption. The optional
contract evaluation below is a separate, conditional result.

Unchanged exports also require the full suite: database contents, environment,
test code and runtime behavior can change independently of export bytes.
Source fingerprints describe exports only; they are not runtime evidence.

The byte-level inventory includes all files, including assets and JSON not
modeled in the AST, so those changes are never silently classified as absent.
This inventory does not interpret component semantics. Semantic candidates
come exclusively from the existing typed AST diff. Symlinks and non-regular
entries are rejected. Use dedicated, immutable export snapshot directories;
do not put the output plan inside either input directory.

No new Oracle runtime API or live-verification claim is introduced. Live APEX
access is not required to produce a plan. Existing parser warnings are retained;
structural errors and unsupported/missing manifests reject the plan.

## Optional reviewed dependency contract

Supply all three flags together:

```sh
apx-select baseline current --contract reviewed-contract.json --suite tests --context external-state.json
```

This still does not execute tests. It adds `contractSelection` to the JSON;
the base `execution` and `candidates` retain their conservative meaning.
`contractSelection.execution` is `reviewed-subset` only when the approved
contract matches the exact input snapshots. `selectedTests` contains explicit
suite-relative filenames; every included or excluded test has an explanation.
For a full-suite fallback, `selectedTests` is `null`, never an empty allowlist.
An invalid, incomplete or stale contract throws (CLI exit 1); no plan is emitted.

The library exports `selectionEvidence`, `selectionContractHash`,
`validateSelectionContract` and `evaluateSelectionContract` from
`@apx/testgen/selection-contract`. A contract body contains:

- `version: 1` and the plan's `baselineFingerprint` / `currentFingerprint`.
- `suiteFingerprint` and `contextFingerprint` from `selectionEvidence`.
- Explicit `completeSuite`, `completeDependencies`, and
  `externalStateReviewed` attestations, each `true`.
- `tests`: one entry per discovered test file, with a permanent human-assigned
  `id`, relative `spec`, semantic `pageIds`, `alwaysRun`, and nonempty `reason`.
  Unknown page ids, duplicate ids/paths, globs and traversal paths are rejected.
  Tests with no page dependencies must use `alwaysRun: true`.
- `approval`: `status: "approved"`, nonempty `reviewedBy` and `reason`, and
  `contentHash` computed with `selectionContractHash(body, reviewedBy, reason)`.

The hash covers the entire body plus reviewer and approval reason. Object keys
are sorted recursively, arrays retain their order, and the UTF-8 canonical JSON
is SHA-256 hashed with a `sha256:` prefix. Editing any covered content invalidates
approval. Computing a digest does **not** approve a contract: a human must review
and explicitly set the approval fields. No command manufactures an approval.
The digest detects content changes; it does not authenticate reviewer identity.
Use repository review/access controls for that purpose.

### What the reviewer must establish

The suite root must include all configured test files and relevant helpers/config.
Discovery recognizes `.spec` and `.test` files with JS/TS, JSX/TSX and module
variants; custom filename conventions or tests outside this root are not covered.
Do not enable contract selection for such a suite. All files under the suite root
are hashed, but imports outside it are not automatically resolved. Record those
dependencies in the external-state record or keep full-suite execution.

The external-state file is a non-secret, reviewer-maintained record of database,
schema, seed-data, environment, application-build and external-code revisions
relevant to this run. Its hash is an integrity check, **not a live check** that
the described state is current. Missing evidence of external state means use the
full suite. Keep this file and the contract outside the export and suite roots.

Dependencies must include transitive cross-page effects. `alwaysRun` is required
for cross-cutting tests that cannot be safely scoped. The tool verifies neither
the truth of these declarations nor completeness of a human-maintained state
record. Reduced selection is conditional on these reviewed attestations, not a
claim of independently proven safety or passing tests.

Warnings, removed/renamed specs, application/manifest changes, changes outside
directly affected page sources, or changed pages with no declared dependencies
force the full-suite fallback even with approval. Identical exports also retain
the full-suite recommendation. Re-review after any export, suite or state-record
change; no Oracle runtime support is added by these contracts.
