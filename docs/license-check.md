# M0 license check — status: PROVISIONALLY GREEN, one manual step remains

## What was verified (July 2026)

- Oracle publicly documents the APEXlang syntax in the APEX 26.1 docs
  ("Reading APEXlang Syntax", App Builder User's Guide) and references an
  official "APEXlang Language Reference" and "APEXlang Atlas" learning tool.
- Oracle's own materials describe APEXlang as an "open application
  specification language": documented, human-readable, an explicit generation
  target for third-party AI agents and tools — while stating the grammar is
  NOT open-source.
- General principle (not legal advice): file formats and grammars as such are
  not protected by copyright; independent implementations written from
  published documentation are standard practice. Oracle's explicit positioning
  of APEXlang as a target for external tools strengthens this further.

## Remaining manual step (do before first public release)

Read the front-matter / legal notices of the APEXlang Language Reference
itself and Oracle's docs.oracle.com terms of use, and record here:
- any restriction on independent implementations (expected: none),
- Oracle trademark guidance affecting naming (until then: do NOT use
  "apexlang" or "apex" as the npm org/package prefix; current working names
  use the neutral "@apx" scope, revisit at release).

## Fixture redistribution

Do not commit Oracle's Sample Database Application export to the repo until
its redistribution terms are checked. The committed fixture is hand-written
from documented syntax examples and is safe.
