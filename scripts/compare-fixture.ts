// Compares a structure run on the Colorado 2026 Blue Book with the hand-made
// fixture, measure by measure: which measures each has, and runs of words
// only one of them has. Run after `npm run guide` has written guide.json:
//   npm run compare-fixture -- cache/<hash>/guide.json

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Guide, Measure } from '../src/schema.ts';
import { covered, gram, grams, measureParts, runs, words } from '../src/stages/verify.ts';

const file = process.argv[2];
if (!file) throw new Error('Usage: npm run compare-fixture -- cache/<hash>/guide.json');
const ours = JSON.parse(await readFile(file, 'utf8')) as Guide;
const fixture = JSON.parse(
  await readFile(join(import.meta.dirname, '..', 'fixtures', 'colorado-2026', 'guide.json'), 'utf8'),
) as Guide;

const byId = new Map(ours.measures.map(m => [m.id, m]));
for (const f of fixture.measures) {
  const m = byId.get(f.id);
  if (!m) {
    console.log(`== ${f.id}: missing from ${file}`);
    continue;
  }
  byId.delete(f.id);
  console.log(`== ${f.id}`);
  for (const field of ['title', 'voteThreshold', 'ballotTitle'] as const) {
    if (f[field] !== m[field]) console.log(`  ${field}: fixture ${JSON.stringify(f[field])}, ours ${JSON.stringify(m[field])}`);
  }
  const headings = (x: Measure) => x.sections.map(s => s.heading).join(' | ');
  if (headings(f) !== headings(m)) console.log(`  sections:\n    fixture ${headings(f)}\n    ours    ${headings(m)}`);
  console.log(`  figures: fixture ${f.figures.length}, ours ${m.figures.length}`);
  for (const [label, a, b] of [['only in fixture', f, m], ['only in ours', m, f]] as const) {
    const known = new Set(measureParts(b).flatMap(p => [...grams(words(p), gram)]));
    const ws = measureParts(a).flatMap(p => words(p));
    for (const r of runs(ws, covered(ws, gram, known), 3)) console.log(`  ${label}: ${r.words.join(' ')}`);
  }
}
for (const id of byId.keys()) console.log(`== ${id}: not in the fixture`);
