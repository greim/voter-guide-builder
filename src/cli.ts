import { parseArgs } from 'node:util';
import { analysisPromptForPage } from './prompts.ts';
import { fetchBooklet } from './stages/fetch.ts';
import { render } from './stages/render.ts';
import { analyze, extract, figures, structure, verify } from './stages/todo.ts';

const usage = `Usage: npm run guide -- --pdf <url-or-path> --out <folder>

  --pdf    The official ballot-measure booklet (URL or local file)
  --out    Folder to write index.html and assets/ into, e.g.
           ../greim.github.io/ballot-guides/colorado-2026
  --cache  Where stage outputs are kept between runs (default: cache)`;

const { values } = parseArgs({
  options: {
    pdf: { type: 'string' },
    out: { type: 'string' },
    cache: { type: 'string', default: 'cache' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values.pdf || !values.out) {
  console.log(usage);
  process.exit(values.help ? 0 : 1);
}

const step = (n: number, name: string) => console.log(`[${n}/7] ${name}`);

step(1, 'fetch');
const cache = await fetchBooklet(values.pdf, values.cache);
console.log(`      cached at ${cache.dir}`);
step(2, 'extract');
await extract(cache);
step(3, 'structure');
const guide = await structure(cache);
step(4, 'verify');
await verify(cache, guide);
step(5, 'analyze');
const analyses = await analyze(cache, guide);
step(6, 'figures');
await figures(cache, guide);
step(7, 'render');
const analysisPrompt = await analysisPromptForPage(guide);
await render({ guide, analyses, analysisPrompt, figuresDir: cache.path('figures') }, values.out);
console.log(`Done. Open ${values.out}/index.html to review.`);
