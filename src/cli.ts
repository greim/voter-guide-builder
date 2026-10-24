import { parseArgs } from 'node:util';
import { analysisPromptForPage } from './prompts.ts';
import { fetchBooklet } from './stages/fetch.ts';
import { render } from './stages/render.ts';
import { extract } from './stages/extract.ts';
import { structure } from './stages/structure.ts';
import { analyze, figures } from './stages/todo.ts';
import { verify } from './stages/verify.ts';

const usage = `Usage: npm run guide -- --pdf <url-or-path> --out <folder>

  --pdf    The official ballot-measure booklet (URL or local file)
  --out    Folder to write index.html and assets/ into, e.g.
           ../greim.github.io/ballot-guides/colorado-2026
  --cache  Where stage outputs are kept between runs (default: cache)
  --source-url    The booklet's public URL, linked from the guide. Defaults
                  to --pdf when that's a URL.
  --skip-verify   Render even if verify finds text that isn't in the booklet.`;

const { values } = parseArgs({
  options: {
    pdf: { type: 'string' },
    out: { type: 'string' },
    cache: { type: 'string', default: 'cache' },
    'source-url': { type: 'string' },
    'skip-verify': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values.pdf || !values.out) {
  console.log(usage);
  process.exit(values.help ? 0 : 1);
}

const step = (n: number, name: string) => console.log(`[${n}/7] ${name}`);

try {
  await run(values.pdf, values.out);
} catch (err) {
  // Stage errors explain themselves; a stack trace only buries the message.
  console.error(`\n${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

async function run(pdf: string, out: string) {
  step(1, 'fetch');
  const cache = await fetchBooklet(pdf, values.cache);
  console.log(`      cached at ${cache.dir}`);
  step(2, 'extract');
  const pages = await extract(cache);
  step(3, 'structure');
  const guide = await structure(cache, pages, values['source-url']);
  console.log(`      ${guide.measures.length} measures`);
  step(4, 'verify');
  try {
    await verify(cache, guide, pages);
  } catch (err) {
    if (!values['skip-verify']) throw err;
    console.warn(`      ${(err as Error).message}`);
  }
  step(5, 'analyze');
  const analyses = await analyze(cache, guide);
  step(6, 'figures');
  await figures(cache, guide);
  step(7, 'render');
  const analysisPrompt = await analysisPromptForPage(guide);
  await render({ guide, analyses, analysisPrompt, figuresDir: cache.path('figures') }, out);
  console.log(`Done. Open ${out}/index.html to review.`);
}
