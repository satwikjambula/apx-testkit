# Prompt template: multi-agent review with room to disagree

Used for a nontrivial change where more than one agent's domain is
touched — a new component, a runtime capability, anything that would
normally move through several pipeline stages. Instead of one agent
trying to satisfy every concern at once, each relevant agent reviews the
SAME proposal from only its own angle and reports independently. Any
single legitimate objection is enough to block, even if every other agent
approved.

```
Multi-agent review: <change>

Product Architect:      [Worth building? / Not now -- reason]
Software Architect:      [Architecturally sound? / Violates ADR-N -- reason]
Oracle APEX Architect:   [Real public API confirmed? / No verified public API -- reason]
Compiler/Parser Engineer: [AST stays lossless/stable? / Gap -- reason]
Runtime & Test Automation Engineer: [Dispatch path confirmed live? / Not yet -- reason]
QA/Verification Engineer: [Evidence sufficient? / Not verified -- reason]
Documentation & DX Engineer: [Docs plan sound? / Gap -- reason]
Release Engineer:       [N/A until implementation exists]

Result: [Approved / Rejected -- <which agent's objection blocks, and what
would resolve it>]
```

## Why this shape, not a single combined verdict

A single agent trying to weigh architecture, Oracle API reality,
verification status, and documentation completeness all at once tends to
average concerns into a mushy "looks fine" instead of surfacing a sharp,
specific objection. Keeping the reviews separate means:

- Each agent only needs to be right about its own domain, not everything.
- A rejection from one agent doesn't get "the rest of the review talked
  it into acceptability" — it stays a firm block until specifically
  addressed.
- The example this project uses to justify the pattern: Software
  Architect approves a clean abstraction; Oracle APEX Architect flags
  that it wraps an undocumented internal; QA/Verification Engineer notes
  it's unverified. Any one of those two objections is enough — the
  overall result is Rejected regardless of how good the abstraction is.

## When to use this vs. the sequential pipeline

The sequential flow in `.ai/AGENT.md` ("How a feature typically flows")
is still the default for building something end to end — each stage
hands off to the next once its own question is answered. Use this
parallel-review template instead when:

- A proposal is contentious or ambiguous enough that sequential handoff
  would let an early "looks fine" from one stage bias later stages.
- You want an explicit, auditable record of each domain's independent
  verdict on the same change (e.g. before a release, or before accepting
  an external contribution).
- Multiple concerns are genuinely orthogonal and none should be allowed
  to silently override another (this is usually true — architecture
  soundness, Oracle API reality, and verification status are independent
  axes, not one blended "does this look okay" judgment).
