import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { settings } from './claude.ts';
import { analysisPromptForPage } from './prompts.ts';
import { fetchBooklet } from './stages/fetch.ts';
import { render } from './stages/render.ts';
import { extract } from './stages/extract.ts';
import { structure } from './stages/structure.ts';
import { analysisPrompt, analyze } from './stages/analyze.ts';
import { figures } from './stages/todo.ts';
import { verify } from './stages/verify.ts';

const usage = `Usage: npm run guide -- --pdf <url-or-path> --out <folder>

  --pdf    The official ballot-measure booklet (URL or local file)
  --out    Folder to write index.html and assets/ into, e.g.
           ../greim.github.io/ballot-guides/colorado-2026
  --cache  Where stage outputs are kept between runs (default: cache)
  --source-url    The booklet's public URL, linked from the guide. Defaults
                  to --pdf when that's a URL.
  --skip-verify   Render even if verify finds text that isn't in the booklet.
  --model <id>    Use another Claude model, e.g. claude-haiku-5-5 for a cheap
                  test run (default: claude-opus-5-5). Its answers are cached
                  separately. "dummy" calls no model at all and answers with
                  placeholders, to test the pipeline for free.
  --web-searches <n>
                  Searches each analysis may run (default 10; 0 turns it off).
  --only <ids>    Only these measures, comma-separated, e.g.
                  amendment-81,proposition-nn.
  --analysis-prompt <file>
                  Your own analysis prompt instead of prompts/analysis.md.
                  It can use {{jurisdiction}}, {{election}} and {{measure}},
                  and is quoted on the page above the analyses.`;

// Settings such as ANTHROPIC_API_KEY can live in a git-ignored .env file.
if (existsSync('.env')) process.loadEnvFile('.env');

const { values } = parseArgs({
  options: {
    pdf: { type: 'string' },
    out: { type: 'string' },
    cache: { type: 'string', default: 'cache' },
    'source-url': { type: 'string' },
    'skip-verify': { type: 'boolean' },
    'analysis-prompt': { type: 'string' },
    model: { type: 'string' },
    'web-searches': { type: 'string', default: '10' },
    only: { type: 'string' },
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
  if (values.model) {
    settings.model = values.model;
    console.log(`      using ${settings.model}`);
  }
  const webSearches = Number(values['web-searches']);
  if (!Number.isInteger(webSearches) || webSearches < 0) throw new Error('--web-searches must be a whole number');
  const only = values.only?.split(',').map(id => id.trim()).filter(Boolean);

  step(1, 'fetch');
  const cache = await fetchBooklet(pdf, values.cache);
  console.log(`      cached at ${cache.dir}`);
  step(2, 'extract');
  const pages = await extract(cache);
  step(3, 'structure');
  const guide = await structure(cache, pages, { sourceUrl: values['source-url'], only });
  console.log(`      ${guide.measures.length} measures`);
  step(4, 'verify');
  try {
    await verify(cache, guide, pages);
  } catch (err) {
    if (!values['skip-verify']) throw err;
    console.warn(`      ${(err as Error).message}`);
  }
  step(5, 'analyze');
  const prompt = await analysisPrompt(values['analysis-prompt']);
  const analyses = await analyze(cache, guide, prompt, webSearches);
  step(6, 'figures');
  await figures(cache, guide);
  step(7, 'render');
  await render({ guide, analyses, analysisPrompt: analysisPromptForPage(guide, prompt.template), figuresDir: cache.path('figures') }, out);
  console.log(`Done. Open ${out}/index.html to review.`);
}
