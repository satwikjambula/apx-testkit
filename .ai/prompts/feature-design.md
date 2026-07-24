# Prompt template: designing a new feature (before writing code)

Used by the Software Architect and Oracle APEX Architect together, before
any implementation work starts. The Product Owner question and the
architecture question are deliberately separate — a feature can be
verifiable and still not worth building right now.

```
Feature design: <name>

1. What is it, in one sentence?

2. Product fit
   - Does it align with docs/ecosystem-roadmap.md's current tier?
   - Is there a real ground-truth need for it (a real app/customer
     scenario), or is it speculative?

3. Architecture fit
   - Which package(s) does this belong in? Does it require a new package,
     or does an existing boundary already fit?
   - Does it change any existing typed AST field's shape, any public
     @apx/testkit or @apx/testgen export, or any CLI flag? (breaking-change
     flag)
   - Does it require a new ADR, or does it fit within the existing four?

4. Verification path
   - Is there a real Oracle public API for this, confirmed how?
   - Which real sample app(s) would validate it?
   - Is live access available, or is this static-ground-truth-only for now
     (i.e., ships as a typed AST field + an UnsupportedComponentError stub,
     not a full runtime wrapper — see ADR-002)?

5. Rough shape of the checklist that applies
   (.ai/checklists/new-component.md, runtime-api.md, or parser-change.md)

Decision: [Build now / Build parser-only for now / Defer / Reject]
Reason: ...
```
