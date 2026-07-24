---
description: Delegate to the Runtime & Test Automation Engineer subagent (packages/testkit, packages/generator, packages/mcp)
argument-hint: <runtime wrapper, generator, or test-generation change>
---

Invoke the `runtime-test-automation-engineer` subagent (via the Task/Agent tool) with the request below. It owns `packages/testkit`, `packages/generator`, and `packages/mcp` — verifying dispatch paths live before wrapping them (ADR-002), resolving runtime static ids via `ApexRegion.htmlDomId` first (ADR-003), and keeping generator output deterministic.

Request: $ARGUMENTS
