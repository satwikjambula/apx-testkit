---
description: Delegate to the Release Engineer subagent (release-gate decision, semver, changelog, final sign-off)
argument-hint: <release to check, or "run the release checklist">
---

Invoke the `release-engineer` subagent (via the Task/Agent tool) with the request below. It runs the full `.ai/checklists/release.md` gate, confirms every other agent's domain is actually in sync, and is empowered to block a release that isn't ready.

Request: $ARGUMENTS
