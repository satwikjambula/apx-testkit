---
name: Bug report
about: Something apx-testkit claims works, doesn't -- against your app
title: ""
labels: bug
---

**What did you expect, and what actually happened?**

**Which Oracle APEX version, and which component/page type?**
(e.g. "26.1.2, an Interactive Grid region")

**Can you share the relevant `.apx` snippet or a minimal reproduction?**
(Please don't paste a full real export if it contains anything you don't
want public -- a trimmed-down snippet showing the shape is usually enough.
This project never commits real Oracle sample-app exports for exactly this
reason.)

**What did apx-testkit do instead?**
(The generated code, the error, the wrong assertion -- whatever's off.)

---
This project only marks something "verified" once it's actually been
checked live or against real export data (see `docs/quirks/26.1.json` and
`docs/grammar-assumptions.md`). If you're reporting that a "verified"
claim doesn't hold on your app, that's exactly the kind of report we most
want -- it means our evidence was too thin, not that you did anything
wrong.
