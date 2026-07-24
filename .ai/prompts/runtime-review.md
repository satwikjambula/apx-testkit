# Prompt template: reviewing a runtime/generator change

Used by the Runtime & Test Automation Engineer (or anyone reviewing its
work) when a change touches `packages/testkit` or `packages/generator`.

```
Runtime/generator change review

✓/✗ Dispatch path confirmed live (direct region[method]() vs. widget-factory)
✓/✗ Tested on >1 instance of the component type before generalizing
✓/✗ Standard widget-factory `option` getter/setter checked before a bespoke API
✓/✗ Runtime static id resolution checked (ApexRegion.htmlDomId first, ADR-003)
✓/✗ Initialization-race checked (does the widget attach asynchronously?)
✓/✗ docs/quirks/26.1.json entry added/updated with literal evidence
✓/✗ Live spike spec added and actually run against the real app
✓/✗ If correcting a prior claim: corrected in place, visibly (not deleted)
✓/✗ Generator determinism preserved (byte-identical regeneration)
✓/✗ UNTRACKABLE_REGION_TYPES / unsupported.ts stubs kept in sync, if applicable

Verdict: [Approved / Approved with follow-ups / Rejected]
Follow-ups (if any): ...
```

A method that "didn't throw" is not the same as a method that's
"confirmed working" — the review must state what the actual observed
return value/behavior was.
