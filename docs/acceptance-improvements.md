# Sequential acceptance improvements

Implementation order agreed with the maintainer on 2026-09-09. Local
verification accompanies each change; live APEX verification follows later.

| Step | Status | Remaining work |
|---|---|---|
| Issue #6 documentation discovery | Committed | Live observations pending; see `dynamic-action-trigger-by-name-discovery` in `docs/quirks/26.1.json`. |
| CI quality gates | Implemented; local checks passed | Warning limits, unmodeled exceptions, required SQLcl and generation-gap budgets. Changed-page test evidence remains separate. |
| Change-based test selection | Next | Explain selected tests; fall back to the full suite for uncertain dependencies. |
| Safe regeneration | Planned | Preview changes, detect edits, preserve custom files and track generated ownership. |
| Dynamic Action test planning | Planned | Describe declared triggers and gaps; mark suggestions as inference and require review. |
| Business scenario contracts | Planned | Build on `.ai/proposals/functional-scenario-authoring.md`, including approval/provenance requirements. |
| Failure evidence in reports | Planned | Consume real test results and link failures to export identities and traces. |
| Role-based acceptance tests | Planned | Explicit expected permissions and external test-account configuration. |
| Grid and CRUD workflows | Live discovery required | Issue #7; verify operations, isolated test records and cleanup before exposing wrappers. |
| Accessibility and visual regression | Planned | Opt-in scans, explicit baselines and review workflow. |
| AI component contracts | Live discovery required | Verify stable outcomes, consent and error handling on APEX 26.1. |

New runtime wrappers are not considered supported until live evidence,
regression coverage and documentation meet the repository guardrails.

2026-09-10 local verification: full `npm run verify` passed (619 tests;
5 corpus-dependent tests skipped because no real export is configured).
Double regeneration is deterministic. The employee-page example was
corrected to match its fixture's existing `unrestricted` access-protection
metadata; generator behavior is unchanged. Real SQLcl and browser checks
remain pending.
