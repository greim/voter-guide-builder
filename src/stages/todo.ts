import type { Cache } from '../cache.ts';
import type { Guide } from '../schema.ts';

// Stage 6, not built yet.

const todo = (stage: string): never => {
  throw new Error(`The ${stage} stage isn't built yet.`);
};

/** Stage 6: crop and render each figure to PNG. Writes figures/<id>.png. */
export async function figures(_cache: Cache, _guide: Guide): Promise<void> {
  todo('figures');
}
