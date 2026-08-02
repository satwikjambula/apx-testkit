# `docs/browser-demo.gif` — how it was recorded

Companion to `docs/demo.tape`/`docs/demo.gif` (the terminal recording) in
the README's "30-second overview": this one is a real Playwright video
recording, proving the generated/testkit assertions actually drive a
visible browser against a live Oracle APEX app — not just that the CLI
prints files.

## What it shows

`spike/tests/browser-demo.spec.ts` — a demo-only spec (not new test
coverage; every assertion in it is the same testkit call already verified
live in `spike/tests/interactive-report-demo.spec.ts`) against the public
UX Pattern Catalog instance (no login required):

1. Navigate to the `browse-interactive-report` page — full, unfiltered
   row set visible.
2. Type `"Item 2"` into the real Interactive Report search box
   (`interactiveReportSearchBox` + `searchInteractiveReport`'s same
   Enter-triggered `QUICK_FILTER` AJAX round-trip) — rows visibly narrow
   from 48 to 11.
3. Sort the `Priority` column ascending, then descending
   (`sortReportColumn`) — row order visibly changes, confirmed via the
   real `aria-sort` attribute.

The only things added purely for the recording (documented in the spec's
header comment, not silent): steps are chained into one continuous flow
instead of separate tests so the recording has no reload/blank gap, the
search is typed character-by-character (`pressSequentially`) instead of
`fill()`'s instant set so it reads as a real typing action on camera, and
a few `page.waitForTimeout()` calls give each state a moment to be
readable. None of this changes which code path is exercised.

## Regenerating it

```bash
# 1. Build everything (repo root)
npm run build --workspaces --if-present

# 2. Confirm the demo spec still passes headless, no video, before
#    burning a recording run on it
cd spike
npx playwright install chromium   # first time only
npx playwright test tests/browser-demo.spec.ts --reporter=list

# 3. Record it — temporary config, not tracked in git (see below)
cat > playwright.record.config.ts <<'EOF'
import { defineConfig } from '@playwright/test';
import { APP_BASE } from './playwright.config.js';

export default defineConfig({
  testDir: '.',
  testMatch: ['tests/browser-demo.spec.ts'],
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  workers: 1,
  outputDir: './recordings',
  use: {
    baseURL: APP_BASE,
    viewport: { width: 1280, height: 800 },
    video: { mode: 'on', size: { width: 1280, height: 800 } },
    trace: 'off',
    screenshot: 'off',
  },
});
EOF
npx playwright test --config=playwright.record.config.ts --reporter=list
# -> spike/recordings/<test-name>/video.webm

# 4. Convert the .webm to an optimized GIF (two-pass palette, same
#    quality/size tier as docs/demo.gif -- ~640px wide, 6fps, ~250-370KB)
WEBM="recordings/<test-name>/video.webm"
ffmpeg -y -i "$WEBM" \
  -vf "fps=6,scale=640:-1:flags=lanczos,palettegen=max_colors=64:stats_mode=diff" \
  /tmp/palette.png
ffmpeg -y -i "$WEBM" -i /tmp/palette.png \
  -lavfi "fps=6,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none" \
  ../docs/browser-demo.gif

# 5. Verify it's real before committing -- extract a few frames and look
#    at them (this is the same bar docs/demo.gif was held to; see the
#    "docs(readme): embed the rendered demo GIF" commit message)
ffmpeg -y -i ../docs/browser-demo.gif -vf "select='eq(n\,10)+eq(n\,30)+eq(n\,50)'" \
  -vsync 0 /tmp/check-%02d.png
open /tmp/check-01.png /tmp/check-02.png /tmp/check-03.png

# 6. Clean up -- neither the recording config nor the .webm/palette are
#    tracked in git
rm -rf recordings playwright.record.config.ts
rm -f /tmp/palette.png /tmp/check-*.png
```

`spike/tests/browser-demo.spec.ts` itself IS committed — it's a real,
runnable spec (part of the normal `spike` typecheck/test surface), it
just exists to make this recording reproducible rather than to assert
new coverage.
