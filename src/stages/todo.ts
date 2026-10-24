import type { Cache } from '../cache.ts';
import type { Analysis, Guide } from '../schema.ts';

// Stages 5 and 6, not built yet. Build order (see README): analyze, then figures.

const todo = (stage: string): never => {
  throw new Error(`The ${stage} stage isn't built yet.`);
};

/** Stage 5: one Claude call per measure with prompts/analysis.md. Writes analyses/<id>.md. */
export async function analyze(_cache: Cache, _guide: Guide): Promise<Analysis[]> {
  return todo('analyze');
}

/** Stage 6: crop and render each figure to PNG. Writes figures/<id>.png. */
export async function figures(_cache: Cache, _guide: Guide): Promise<void> {
  todo('figures');
}
