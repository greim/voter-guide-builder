# voter-guide-builder

Turns an official ballot-measure booklet (PDF) into a voter guide that reads
well in a browser, on a phone, and printed to PDF.

```
npm install
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env   # or export it in your shell
npx voter-guide-builder interactive
```

`interactive` asks for each choice in turn (the booklet, the output folder,
the model, and so on), shows the matching `generate` command, and runs it. It
also confirms which API key to use (showing only its last characters), or asks
for one if none is set; a typed key is used for that run only. Given a local
PDF, it asks for the public URL and downloads it to check it's the same file.
`generate` takes the same choices as options, for repeat runs:

```
npx voter-guide-builder generate \
  --pdf https://content.leg.colorado.gov/sites/default/files/2026-blue-book-en-accessible.pdf \
  --out ../greim.github.io/ballot-guides/colorado-2026
```

Only `--pdf` and `--out` are required. `npx voter-guide-builder help generate`
lists the rest. `--pdf` can also be a downloaded file; then pass
`--source-url` so the guide links to the published booklet.

To test the pipeline for free, pass `--model dummy` (or pick dummy in
`interactive`): no model is called, and placeholder answers of the right shape
come back instantly (three made-up measures copied from the booklet's own
lines, so verify still runs for real). For a cheap test run with a real model,
combine `--model claude-haiku-5-5` (a much cheaper model), `--web-searches 0`
and `--only amendment-81,proposition-nn`. Answers from another model are
cached apart from the default model's, which are reused when present.

The analyses follow `prompts/analysis.md`. To use your own prompt without
editing that file, pass `--analysis-prompt my-prompt.md`; it can use
`{{jurisdiction}}`, `{{election}}` and `{{measure}}`, and the guide quotes it
above the analyses. `prompts/analysis-format.md` adds what the page needs
(Markdown sections, a Sources list) and isn't shown. Analyses are cached under
a fingerprint of both prompts, so changing either writes new ones.

Then open the output's `index.html` and PDF, review, and commit and push the Pages repo.
The guide appears at `https://greim.github.io/ballot-guides/colorado-2026/`.

## How it works

The PDF step prints the page with your installed Google Chrome. Without
Chrome, run `npx playwright install chromium` once and it uses that instead.

Code runs every stage in order; Claude is called only where judgment is needed.
Each stage writes to `cache/<pdf-hash>/` and is skipped when its output exists,
so delete one file to redo one piece. To fix a measure by hand, edit
`measures/<id>.json` (or `outline.json` for page ranges); `guide.json` is
rebuilt from those on every run.

Verify compares each measure's words with the PDF text of its pages, ignoring
case and punctuation. Any guide words missing from the booklet stop the run,
since that means Claude reworded or added something. Booklet text the guide
left out is only listed, because page headers and legal text are expected
there. `--skip-verify` renders anyway.

| # | Stage | Done by | Writes |
|---|---|---|---|
| 1 | fetch | code | `booklet.pdf` |
| 2 | extract | code (mupdf) | `pages.json`: text and image positions per page |
| 3 | structure | Claude: one call to find the measures, then one per measure on just its pages | `outline.json`, `measures/*.json`, then `guide.json` (see `src/schema.ts`) |
| 4 | verify | code | `verify-report.txt`; stops on guide text that isn't in the booklet |
| 5 | analyze | Claude with web search, one call per measure | `analyses/<prompt fingerprint>/*.md` |
| 6 | figures | Claude gives a rough box around each graphic on its page; code snaps it to what's drawn there, leaving out the caption, and renders it at 3x | `figures/<id>.json` (the box, in PDF points), `figures/<id>.png` |
| 7 | render | code (`src/stages/render.ts`, `styles/main.css`) | `<out>/index.html`, `<out>/assets/` |
| 8 | pdf | code (headless Chrome, using the page's print CSS) | `<out>/<out folder name>.pdf` |

`src/schema.ts` is state-neutral: booklet sections are Markdown, and special
pieces like the YES/NO boxes are optional typed fields. Guides share one
stylesheet, linked as `../main.css` from each guide folder.

## Layout

```
bin/            the voter-guide-builder command
src/            pipeline code (cli.ts parses the command, pipeline.ts runs the stages)
scripts/        fixture tools (see below)
prompts/        prompts sent to Claude
styles/         main.css, copied into the Pages repo on each run
assets/icons/   heading icons, copied next to main.css
fixtures/       hand-made Colorado 2026 guide: the answer key for each stage
cache/          stage outputs (git-ignored)
out/            scratch output (git-ignored)
```

## Fixtures

`fixtures/colorado-2026/` holds the hand-made 2026 page (`guide.html`) and the
Markdown it came from. `npm run fixture` turns that Markdown into `guide.json`
and `analyses/*.md`, the data the later stages should produce.
`npm run render-fixture -- out/colorado-2026` renders that data, and its PDF, so
the render and pdf stages can be checked against `guide.html` without calling
Claude.
`npm run compare-fixture -- cache/<hash>/guide.json` compares a structure run
on the Blue Book with the fixture. Save the Blue Book as
`fixtures/colorado-2026/blue-book.pdf` (git-ignored).

## Status

Every stage is built. To fix a figure's crop, edit `figures/<id>.json` in the
cache: change `rough` and re-run, or add `"exact": [x0, y0, x1, y1]` (PDF
points, origin top left) to use that box as is.
