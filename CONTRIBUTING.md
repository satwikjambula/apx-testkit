# Contributing

Thanks for considering it. Ground rules that keep this project trustworthy:

**Evidence over assumption.** The parser and generator only encode behaviors
verified against real 26.1 exports and live instances. docs/grammar-assumptions.md
is the ledger: "Verified" entries cite how they were verified; "Open" entries
are the contribution backlog. A PR that adds an assertion type must add its
verification evidence (an export snippet + a live-instance observation) to the
ledger in the same PR.

**Determinism is a contract.** `apx-testgen` must produce byte-identical
output for identical input. CI enforces this (double-generate + diff). No
timestamps, no randomness, no environment-dependent ordering.

**Generated code never contains raw selectors.** It imports testkit
primitives built on documented apex.* JS APIs and verified DOM contracts.
When an APEX release changes the DOM, we fix the testkit once.

**Never commit Oracle-authored exports.** Integration tests reference a local
export path (APX_EXPORT_DIR env var) and skip when absent. Hand-written
fixtures under test/fixtures are fine.

**Good first contributions** (from the ledger's Open list): typed projection
for facet / dynamicAction / process / column / savedReport; the required-flag
canonical property (build a form with a required item, export, report);
quoting/escaping hostile fixtures; region selector contract once the DOM
convention is established; the M2 login fixture for non-public pages.

**Support matrix.** Each release states which APEX versions it was verified
against. Verifying a new APEX release is itself a valued contribution.
