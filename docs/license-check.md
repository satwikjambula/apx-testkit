# M0 license check — status: GREEN, both open items resolved (2026-07-22)

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

## Remaining manual step — RESOLVED

Read Oracle's docs.oracle.com legal notices, the "Reading APEXlang Syntax"
page itself
(https://docs.oracle.com/en/database/oracle/apex/26.1/apxdc/reading-apexlang-syntax.html),
and Oracle's trademark guidelines
(https://www.oracle.com/legal/trademarks/). Findings:

**1. Independent implementation: no restriction found, and Oracle's own
docs affirmatively invite it.** The standard Oracle documentation legal
notice (present across the 26.1 doc set, e.g. the APEX API Reference and
Release Notes) restricts *copying Oracle's documentation text* and
*reverse-engineering Oracle's software*, "unless required by law for
interoperability." Writing an independent parser for a documented,
human-readable file format from published syntax descriptions and examples
is neither — it's the same category as independently implementing a parser
for JSON, YAML, or Markdown from their public specs. This reading is
reinforced by the "Reading APEXlang Syntax" page's own words: APEXlang's
"clean, modern syntax makes it easy for developers **and AI coding
assistants** to read and write" — Oracle is explicitly describing APEXlang
as an interchange format meant for external tooling to consume, not a
protected internal format. No terms-of-use language anywhere in the pages
reviewed restricts building compatible readers/tools from the published
grammar. **Conclusion: proceed with the parser as planned; no clean-room
fallback needed.**

**2. Trademark: naming risk is real and specific, confirmed by Oracle's own
guidelines — the existing `apx-*` decision is the correct one, not
excessive caution.** Oracle's Third Party Usage Guidelines for Oracle
Trademarks (oracle.com/legal/trademarks/) state under "Prohibited Use ->
Company, Product or Service Names": *"Do not use Oracle trademarks or
potentially confusing variations as all or part of your company, product or
service names... For example, 'XYZ for Oracle database' not 'OraXYZ or XYZ
Oracle.'"* The "Open Source Software" section separately states: *"you may
not incorporate Oracle trademarks in the name of your distribution or other
products that incorporate open source elements"* without a license.
"Oracle APEX" / "APEX" functions as a product identifier Oracle actively
protects under these guidelines (regardless of any specific USPTO
registration number, which this review did not need to pin down — the
guidelines themselves are the operative constraint for a project like this).
"Apexlang" and "Apex" as a project/package name prefix are exactly the kind
of "potentially confusing variation" the guidelines prohibit.
**Conclusion: keep the `apx-*` naming (parser/testgen/testkit/mcp scopes,
repo name) permanently, not just until some review — this isn't a
provisional placeholder, it's the compliant choice.** If a public-facing
name is wanted, follow the tag-line pattern Oracle documents: e.g. "apx-testkit,
a Playwright test generator for Oracle APEX" (descriptive tag line, not
"OracleTestkit" or "ApexTestGen").

## Fixture redistribution

Do not commit Oracle's Sample Database Application export to the repo until
its redistribution terms are checked. The committed fixtures
(`packages/parser/test/fixtures/`, `packages/generator/test/fixtures/`) are
hand-written from documented syntax examples and are safe.

## 13 local-only Oracle sample-gallery apps — still open, deliberately, per app

The 13 real Oracle sample-gallery apps parsed for ground truth (UX Pattern
Catalog, `apextogo`, `brookstrut`, `image-support-rte`, `interactive-grids`,
`sample-application-search`, `sample-calendar`, `sample-cards`,
`sample-charts`, `sample-collections`, `sample-dynamic-actions`,
`sample-master-detail`, `sample-vector-search`, `workflow-approvals`) remain
local-only, same as the rest of the real-app corpus — see
`.ai/knowledge/verification.md`'s "Real Oracle apps this project has access
to" and its "Separate, deliberate note" resolution for the full picture.

A 2026-07-27 Product Architect review found that `github.com/oracle/apex`'s
`26.1` branch (confirmed UPL-1.0, a permissive Oracle license) has an
exact-or-renamed name match for all 13 (e.g. `brookstrut-sample-app` ↔
`brookstrut`, `sample-approvals` ↔ `workflow-approvals`) — see
`.ai/knowledge/verification.md` for the full match list. **This is
supporting evidence, not a resolution**: per this doc's own discipline, a
specific app's license isn't "checked" until its actual content is
confirmed the same app (not just the same name) from that source, the way
every other app in the corpus was individually confirmed before being
added. No such per-app content check has been done for any of the 13 yet,
and bulk-doing it now was deliberately deferred — see the linked note for
the full reasoning (in short: license clarity alone isn't the trigger this
project commits infrastructure changes on; a concrete blocked need is).

**Trigger condition to revisit**: `docs/limitations.md`'s Generator section
names `UX Pattern Catalog` specifically as the reason the generator's
determinism claim can't be proven against a real multi-page export instead
of a hand-written fixture, citing "redistribution rights unchecked." If
that capability is ever actually needed, do the content-level check for
`UX Pattern Catalog` specifically (not the other 12) against
`oracle/apex`'s `ux-pattern-catalog` app, and decide then whether to commit
it (or a derived fixture). The other 12 apps have no similarly-documented
blocked capability and should stay local-only until one exists.
