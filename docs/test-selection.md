# Change-based test planning (first increment)

`apx-select <baseline-export-dir> <current-export-dir>` prints a deterministic
JSON impact plan. The library equivalent is `planTestSelection` from
`@apx/testgen/selection`. Both require canonical APEX 26.1 exports.

The plan identifies directly changed/added pages and their generated spec
filenames, explains each candidate, lists current generated specs, and lists
obsolete generated specs after page removal or alias changes. It does not
generate, delete, run, or skip tests. Exit 0 means a plan was produced, not
that tests passed; invalid exports exit 1 and invalid CLI arguments exit 2.

## Safety boundary

**This is advisory planning, not reduced-suite execution.** Every plan currently
sets `execution: "full-suite"`. Run the full configured Playwright suite,
including hand-written tests; `currentGeneratedSpecs` is only the generated
inventory, not an exhaustive suite. `candidates` must not be used as an
execution allowlist. The AST does not establish complete cross-page, shared
code, database or hand-written-test dependencies. Proving those dependencies
with reviewed test contracts is a future increment, not an implicit assumption.

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
