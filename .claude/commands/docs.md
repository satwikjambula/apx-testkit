---
description: Delegate to the Documentation & DX Engineer subagent (roadmap, coverage matrix, README, tutorial, kept in sync together)
argument-hint: <doc update or DX review>
---

Invoke the `documentation-dx-engineer` subagent (via the Task/Agent tool) with the request below. It updates `docs/ecosystem-roadmap.md`, `docs/component-coverage-matrix.md`, `docs/support-matrix.md`, `README.md`'s capability matrix, and `docs/tutorial.md` together whenever a component's status changes — never just one of them.

Request: $ARGUMENTS
