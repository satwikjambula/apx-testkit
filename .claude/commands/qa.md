---
description: Delegate to the QA/Verification Engineer subagent (evidence validation, regression sweep, empowered to reject)
argument-hint: <claim, change, or release to verify>
---

Invoke the `qa-verification-engineer` subagent (via the Task/Agent tool) with the request below. It validates claims against `docs/quirks/26.1.json`, `docs/grammar-assumptions.md`, and the real Oracle sample-app corpus, runs the full regression sweep, and is explicitly empowered to reject unverified work with a concrete next verification step.

Request: $ARGUMENTS
