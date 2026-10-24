# voter-guide-builder

Turns an official ballot-measure booklet (PDF) into a voter guide that reads
well in a browser, on a phone, and printed to PDF.

```
npm install
export ANTHROPIC_API_KEY=...
npm run guide -- --pdf https://content.leg.colorado.gov/sites/default/files/2026-blue-book-en-accessible.pdf \
                 --out ../greim.github.io/ballot-guides/colorado-2026
```

Then open the output's `index.html`, review, and commit and push the Pages repo.
The guide appears at `https://greim.github.io/ballot-guides/colorado-2026/`.

## How it works

Code runs every stage in order; Claude is called only where judgment is needed.
Each stage writes to `cache/<pdf-hash>/` and is skipped when its output exists,
so delete one file to redo one piece.

| # | Stage | Done by | Writes |
|---|---|---|---|
| 1 | fetch | code | `booklet.pdf` |
| 2 | extract | code (mupdf) | `pages.json`, `pages/*.png` |
| 3 | structure | Claude | `guide.json` (see `src/schema.ts`) |
| 4 | verify | code | `verify-report.txt`; stops on text that went missing |
| 5 | analyze | Claude, one call per measure, `prompts/analysis.md` | `analyses/*.md` |
| 6 | figures | code | `figures/*.png` |
| 7 | render | code, `templates/` + `styles/main.css` | `<out>/index.html`, `<out>/assets/` |

`src/schema.ts` is state-neutral: booklet sections are Markdown, and special
pieces like the YES/NO boxes are optional typed fields. Guides share one
stylesheet, linked as `../main.css` from each guide folder.

## Layout

```
src/            pipeline code (cli.ts runs the stages)
prompts/        prompts sent to Claude
templates/      HTML template for the render stage
styles/         main.css, copied into the Pages repo on each run
assets/         icons used by the template
fixtures/       hand-made Colorado 2026 guide: the answer key for each stage
cache/          stage outputs (git-ignored)
```

## Status

Only `fetch` is built. Build order:

1. **render**: reproduce `fixtures/colorado-2026/guide.html` from fixture data
2. **extract, structure, verify**: match `fixtures/colorado-2026/blue-book.md`
3. **analyze**: compare tone and length with `fixtures/colorado-2026/analyses.md`
4. **figures**: compare with the fixture PNGs
