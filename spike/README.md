# Spike: metadata -> DOM verification (run this on your machine)

Purpose: one run against the live UX Pattern Catalog instance answers the four
load-bearing unknowns (URL rule, region DOM convention, apex.item mapping,
console guard viability). The spec was GENERATED from the parsed .apx AST of
page 410 — nothing in it was read from a browser first. Expect the first run
to fail informatively; the REGION/BUTTON MAPPING REPORTs it prints are the
actual deliverable.

    cd spike
    npm install
    npm run setup          # downloads chromium
    npm test               # or: npm run test:headed

Override target: APEX_BASE_URL=https://.../ords/r/<workspace>/<app-alias> npm test

Interpreting failures:
- Q1 fails (non-2xx): the alias->friendly-URL rule differs — capture the real
  URL from the browser and note the transform.
- Q2 fails for some regions: read REGION MAPPING REPORT; if a region matches
  under a convention we did not probe, add it. Regions with NO hits usually
  means templates suppress the static id for that template type — that is a
  finding, record which region TYPES lose their ids.
- Q3 fails: item ids transformed at render time — record the transform.
- Q4 fails: paste the console errors; decide guard allowlist policy.

Whatever the reports say becomes verified fact in docs/grammar-assumptions.md
and the selector contract the real generator will emit.
