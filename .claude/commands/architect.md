---
description: Delegate to the Software Architect subagent (package boundaries, ADR compliance, breaking-change review)
argument-hint: <question or change to review>
---

Invoke the `software-architect` subagent (via the Task/Agent tool) with the request below. It owns monorepo structure, package boundaries, the four ADRs in `.ai/ADR/`, and cross-package API stability — not day-to-day feature implementation inside `packages/*/src/`.

Request: $ARGUMENTS
