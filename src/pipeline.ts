import { settings } from './claude.ts';
import { analysisPromptForPage } from './prompts.ts';
import { fetchBooklet } from './stages/fetch.ts';
import { render } from './stages/render.ts';
import { extract } from './stages/extract.ts';
import { structure } from './stages/structure.ts';
import { analysisPrompt, analyze } from './stages/analyze.ts';
import { figures } from './stages/todo.ts';
import { verify } from './stages/verify.ts';
import { printPdf } from './stages/pdf.ts';

/** Everything a run needs; `generate` takes these as options and `interactive` asks for them. */
export interface RunOptions {
  pdf: string;
  out: string;
  cache: string;
  sourceUrl?: string;
  skipVerify?: boolean;
  analysisPrompt?: string;
  model: string;
  webSearches: number;
  only?: string[];
}

const step = (n: number, name: string) => console.log(`[${n}/8] ${name}`);

export async function run(o: RunOptions): Promise<void> {
  settings.model = o.model;
  console.log(`      using ${settings.model}`);

  step(1, 'fetch');
  const cache = await fetchBooklet(o.pdf, o.cache);
  console.log(`      cached at ${cache.dir}`);
  step(2, 'extract');
  const pages = await extract(cache);
  step(3, 'structure');
  const guide = await structure(cache, pages, { sourceUrl: o.sourceUrl, only: o.only });
  console.log(`      ${guide.measures.length} measures`);
  step(4, 'verify');
  try {
    await verify(cache, guide, pages);
  } catch (err) {
    if (!o.skipVerify) throw err;
    console.warn(`      ${(err as Error).message}`);
  }
  step(5, 'analyze');
  const prompt = await analysisPrompt(o.analysisPrompt);
  const analyses = await analyze(cache, guide, prompt, o.webSearches);
  step(6, 'figures');
  await figures(cache, guide);
  step(7, 'render');
  await render({ guide, analyses, analysisPrompt: analysisPromptForPage(guide, prompt.template), analysisSettings: { model: o.model, webSearches: o.webSearches }, figuresDir: cache.path('figures') }, o.out);
  step(8, 'pdf');
  const pdf = await printPdf(o.out);
  console.log(`Done. Open ${o.out}/index.html and ${pdf} to review.`);
}
