# Support matrix

**Verified against Oracle APEX 26.1 only.** Nothing in this repo has been
run against any other APEX version. Do not assume backward or forward
compatibility.

| Component | Verified against | How |
|---|---|---|
| `@apx/parser` grammar | APEX 26.1.0+3102 (UX Pattern Catalog export) | Full export parses with zero warnings — see docs/grammar-assumptions.md |
| `@apx/testkit` item.ts | Live APEX 26.1 instance (same app) | apex.item() round-trip verified for textField, textarea, numberField, selectList, datePicker, hidden |
| `@apx/testkit` session.ts | Live APEX 26.1 instance (same app) | Friendly-URL alias resolution, title normalization rule |
| `@apx/testkit` region.ts / button.ts | Partially — see docs/grammar-assumptions.md "Still open" | region.ts only claims what apex.region()'s own API reports; button.ts uses accessible-role/label locators, not a verified static-id convention |
| `@apx/testkit` auth.ts | Partially verified: live, against a SECOND real APEX 26.1 app (Sample File Upload and Download) | Field ids (P101_USERNAME/P101_PASSWORD) confirmed exact match, no changes needed. Submission switched from Enter to a button click after live evidence of Enter unreliability; that specific fix is NOT yet independently re-verified — see docs/limitations.md |
| `@apx/testgen` generator output | Live APEX 26.1 instance, one app (UX Pattern Catalog) | 39/43 generated smoke tests passed live; determinism verified against a committed synthetic fixture, not the real export (not available in every environment) |

## What "verified against one app" means

Every runtime fact in docs/grammar-assumptions.md's "Runtime verification"
section came from a single application (UX Pattern Catalog, a reference/demo
app). A second, independent app with different region types, a real login
page, and a `required` item would either confirm or break several open
assumptions (see docs/grammar-assumptions.md "Still open" and CLAUDE.md
"Outstanding debts"). Treat every "verified" claim in this repo as "verified
for this one app" until that happens.

## Not supported, by design

- Pre-26.1 APEX applications.
- Interactive Grid deep interaction (cell editing, etc.) — v0.2 at earliest.
- `.apx` writing/emitting — SQLcl owns import; this project is read-only.
- Linting — APEX Advisor and SQLcl own that role.
- Data-dependent assertions — the generator cannot know your data.
