# Prompt template: reviewing a parser change

Used by the Compiler/Parser Engineer (or anyone reviewing its work) when
a change touches `packages/parser`. Answer each line with evidence, not
impression — cite the specific EBNF production or real export data, or
say plainly that it wasn't checked.

```
Parser change review

✓/✗ Full relevant EBNF production(s) checked (not just assumed properties)
✓/✗ Cross-checked against real export data (which apps, how many occurrences)
✓/✗ raw metadata preserved for anything not newly typed (ADR-001)
✓/✗ New/changed field wired into apx-diff's field-by-field diffing
✓/✗ Regression tests added (failing-without-fix confirmed, if a bug fix)
✓/✗ Zero-warnings sweep across all real local exports
✓/✗ Determinism check against examples/employee-page (byte-identical)
✓/✗ docs/grammar-assumptions.md entry added/updated

Verdict: [Approved / Approved with follow-ups / Rejected]
Follow-ups (if any): ...
```

If any EBNF claim and real data disagree, state which one the change
follows and why (ADR-004: real data wins) — don't let this pass silently.
