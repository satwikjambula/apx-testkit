---
name: Feature request
about: A component or capability apx-testkit doesn't support yet
title: ""
labels: enhancement
---

**What component or capability is missing?**
(e.g. "a runtime component for Map regions", "typed AST support for X")

**What real app of yours needs it?**
This project deliberately doesn't build ahead of real ground truth (see
`docs/ecosystem-roadmap.md` and the Product Architect's role in
`.claude/agents/product-architect.md`) -- a concrete real app that needs
this is worth far more to a decision than "it'd be nice to have."

**Do you have a live, running instance you could help verify against?**
Runtime capabilities in this project only ship after being called live
against a real APEX instance (ADR-002). If you have one and are willing to
help check behavior, say so here -- it's often the actual blocker.

**Is there a simpler thing that would get you most of the way there?**
(e.g. a parser-only typed field with no runtime component yet is often the
right stopping point -- see ADR-002's precedent.)
