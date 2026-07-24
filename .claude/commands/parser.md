---
description: Delegate to the Compiler/Parser Engineer subagent (packages/parser, typed AST, EBNF cross-checks)
argument-hint: <parser change or field to add/fix>
---

Invoke the `compiler-parser-engineer` subagent (via the Task/Agent tool) with the request below. It owns `packages/parser` exclusively, checks the full relevant EBNF production(s) via `curl` (never `WebFetch` — that tool is deliberately excluded from its toolset), cross-checks real export data, and wires every new field into `apx-diff` in the same change.

Request: $ARGUMENTS
