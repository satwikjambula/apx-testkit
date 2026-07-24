# VHS tape script -- generates a REAL terminal GIF from actually running
# apx-testgen against the committed, safe synthetic fixture (no real
# Oracle export data involved -- see docs/grammar-assumptions.md's
# "Fixture policy"). Nothing here is staged or faked; every command in
# this script is one this project's own regression sweep actually runs.
#
# Render it yourself:
#   brew install vhs        # or: go install github.com/charmbracelet/vhs@latest
#   cd <repo-root>
#   npm run build --workspaces --if-present
#   vhs docs/demo.tape      # writes docs/demo.gif
#
# Then embed it in README.md:
#   ![apx-testgen demo](docs/demo.gif)

Output docs/demo.gif

Set FontSize 18
Set Width 1200
Set Height 650
Set Theme "Dracula"
Set TypingSpeed 40ms

Type "# apx-testkit: .apx export -> deterministic Playwright tests, in one command"
Enter
Sleep 1s

Type "ls packages/generator/test/fixtures/reference-fixtures/pages"
Enter
Sleep 1500ms

Type "node packages/generator/dist/cli.js packages/generator/test/fixtures/reference-fixtures --out /tmp/demo-tests"
Enter
Sleep 2s

Type "tree /tmp/demo-tests 2>/dev/null || find /tmp/demo-tests -type f"
Enter
Sleep 1500ms

Type "cat /tmp/demo-tests/*.page.ts"
Enter
Sleep 3s

Type "# Byte-identical every run -- that's what makes apx-diff meaningful"
Enter
Sleep 1500ms
