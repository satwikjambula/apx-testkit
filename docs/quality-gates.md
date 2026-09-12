# Onboarding quality gates

`apx-onboard --quality-policy <file.json>` evaluates explicit CI rules
against the current onboarding run. Commit the policy to the application
repository so reviewers can see rule and exception changes.

Example policy for baseline comparison:

```json
{
  "version": 1,
  "maxWarningIncrease": 0,
  "allowedUnmodeledComponents": []
}
```

```sh
apx-onboard --export ./export --baseline ./baseline \
  --tests ./tests-generated --docs ./docs-generated \
  --report ./onboarding-report.json --quality-policy ./apx-quality.json
```

Only configured rules run. Without a policy, `qualityGate` is `null`, not
a recorded pass. Empty policies, unknown fields, wrong types, invalid
limits and unsupported versions fail before generation or SQLcl runs.

| Policy field | Decision |
|---|---|
| `maxParserWarnings` | Maximum parser-warning count in the current export. |
| `maxWarningIncrease` | Maximum net increase in warning count from the baseline. Without a baseline the rule is blocked and the gate fails. A removed warning can offset a newly introduced warning; this rule does not compare individual warning identities. |
| `allowedUnmodeledComponents` | Only the exact listed unmodeled construct types are allowed. `[]` disallows all. Each exception needs a non-empty `reason`. Omit to disable. This uses the parser's unmodeled-construct inventory, not every unsupported runtime component. |
| `requireSqlcl` | When true, requires explicitly requested SQLcl validation to pass. Add `--sqlcl` to execute it. The policy itself does not start SQLcl. |
| `maxSkippedRegions` | Maximum number of regions lacking an automatically generated assertion, from generation diagnostics. |
| `maxNotAutoRoutablePages` | Maximum number of pages requiring explicit navigation handling, from generation diagnostics. |

Limits must be non-negative safe integers. Exceptions use exact types,
with no wildcard matching:

```json
{
  "version": 1,
  "allowedUnmodeledComponents": [
    { "type": "customConstruct", "reason": "Manual review tracked in application issue 42." }
  ]
}
```

The report preserves the normalized policy, each rule's actual and expected
values, its `passed`/`failed`/`blocked` status, and exceptions actually used.
Missing prerequisites fail the overall gate. Results are deterministic;
no wall-clock expiry or implicit exception is applied.

The CLI writes the report and generated artifacts for review even when a
rule fails, then exits **1**. Do not deploy artifacts based on their
existence. Malformed CLI arguments exit **2**; malformed policy files,
invalid exports and tool invocation failures exit **1** before generation.
A completed SQLcl validation failure also exits 1 independently of policy.

The `onboard_generated_apex_app` MCP tool accepts `qualityPolicyPath` and
uses the same evaluator. A completed gate or SQLcl validation failure
returns the full JSON report with `isError: true`; input/invocation errors
return an error message. Library callers pass `qualityPolicy` to
`runOnboarding()` and use `onboardingFailed(report)` for the combined
SQLcl/policy decision. Completed failed checks return a report, not an exception.

These rules measure export and generation diagnostics. Component touches,
generated test files and a passing gate do not establish that acceptance
tests passed. Changed-page test gates need test results linked to the
current export; that integration is a separate feature. Live Oracle API
verification and real SQLcl validation remain separate checks.
