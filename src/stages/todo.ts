import type { Cache } from '../cache.ts';
import type { Analysis, Guide } from '../schema.ts';

// Stages 2 to 7, not built yet. Build order (see README): render first, using
// fixtures/colorado-2026 as its input, then extract + structure + verify,
// then analyze, then figures.

const todo = (stage: string): never => {
  throw new Error(`The ${stage} stage isn't built yet.`);
};

/** Stage 2: positioned text blocks and page renders via mupdf. Writes pages.json, pages/*.png. */
export async function extract(_cache: Cache): Promise<void> {
  todo('extract');
}

/** Stage 3: Claude turns the PDF + text blocks into the Guide schema. Writes guide.json. */
export async function structure(_cache: Cache): Promise<Guide> {
  return todo('structure');
}

/** Stage 4: word-level comparison of each measure's Markdown with the PDF text for its pages. */
export async function verify(_cache: Cache, _guide: Guide): Promise<void> {
  todo('verify');
}

/** Stage 5: one Claude call per measure with prompts/analysis.md. Writes analyses/<id>.md. */
export async function analyze(_cache: Cache, _guide: Guide): Promise<Analysis[]> {
  return todo('analyze');
}

/** Stage 6: crop and render each figure to PNG. Writes figures/<id>.png. */
export async function figures(_cache: Cache, _guide: Guide): Promise<void> {
  todo('figures');
}

/** Stage 7: template + styles/main.css into the output folder. */
export async function render(_cache: Cache, _guide: Guide, _analyses: Analysis[], _outDir: string): Promise<void> {
  todo('render');
}
