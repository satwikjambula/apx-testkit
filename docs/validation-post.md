# Draft: community validation post (M0)

Where to post: Oracle APEX forum, r/orclapex, and as a comment/reply where the
"APEX developer environment for the AI era" discussion is happening. Adjust
tone per venue; keep the ask concrete.

---

**Title: Would you use a tool that generates a Playwright regression suite
straight from your APEXlang (.apx) export? (verified on 26.1)**

With 26.1, our apps finally exist as readable source (.apx files), and AI
agents can now edit pages and PL/SQL directly. What I keep running into is
the missing safety net: when an AI assistant (or a colleague) changes a page,
nothing automatically tells me whether the page still renders, validations
still fire, and the console is clean.

I'm building an open-source toolkit and want to know if anyone besides me
would actually run it in CI:

1. **apx parser** — a standalone library that turns an APEXlang export into a
   typed JSON model (pages, regions, items, buttons, static IDs). Read-only;
   import stays with SQLcl.
2. **Playwright testkit** — login/session fixtures, console-error guard, and
   component helpers built on the documented apex.item()/apex.region() APIs
   and the new stable domIds (no brittle CSS selectors).
3. **Test generator** — point it at your export, get deterministic page
   objects + smoke tests per page: page loads authenticated, no JS errors,
   regions render, required items reject empty submit. Same input, identical
   output — so regenerated tests show up as reviewable diffs next to your
   .apx diffs in the same PR.

Deliberately NOT in scope: pre-26.1 apps, Interactive Grid deep editing (v2
maybe), data-dependent assertions, any AI in the test loop.

Questions for you:
- Would you run generated smoke tests like these in CI, or is this solving a
  problem you don't have?
- Which generated check would you trust/value most — and which page types
  (IR, IG, forms, cards) break most often for you today?
- Is anyone already doing Playwright against APEX with a setup worth stealing
  from?

If there's interest I'll publish the parser first (it's useful for other
tooling too — docs generation, custom checks). If this lands flat, that's a
useful answer as well.
