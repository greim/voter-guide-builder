import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Cache } from '../cache.ts';

// Stage 1: get the booklet's bytes, from a URL or a local path, and key the
// cache by their hash so a re-published booklet never reuses stale results.

export async function fetchBooklet(source: string, cacheRoot: string): Promise<Cache> {
  const bytes = await readBooklet(source);
  const hash = hashOf(bytes);
  const cache = new Cache(join(cacheRoot, hash));
  if (!(await cache.has('booklet.pdf'))) {
    await cache.writeText(bytes, 'booklet.pdf');
    await cache.writeJson({ source, fetchedAt: new Date().toISOString() }, 'source.json');
  }
  return cache;
}

export async function readBooklet(source: string): Promise<Uint8Array> {
  return /^https?:\/\//.test(source) ? download(source) : readFile(source);
}

export function hashOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
  return new Uint8Array(await res.arrayBuffer());
}
