// Builds fixtures/colorado-2026/{guide.json,analyses/} from the hand-made
// Markdown, plus the ballot titles that exist only in the hand-edited HTML.
// This is the answer key for the structure and analyze stages, and the input
// for rendering the fixture. Run: npm run fixture

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Analysis, FigureRef, Guide, Measure, Section } from '../src/schema.ts';
import { slug } from '../src/stages/render.ts';

const dir = join(import.meta.dirname, '..', 'fixtures', 'colorado-2026');
const blueBook = await readFile(join(dir, 'blue-book.md'), 'utf8');
const analysesMd = await readFile(join(dir, 'analyses.md'), 'utf8');
const html = await readFile(join(dir, 'guide.html'), 'utf8');

/** Splits Markdown on headings of exactly `level`, dropping anything before the first. */
function splitOn(md: string, level: number): { heading: string; body: string }[] {
  const marker = '#'.repeat(level) + ' ';
  const out: { heading: string; body: string }[] = [];
  for (const line of md.split('\n')) {
    if (line.startsWith(marker)) out.push({ heading: line.slice(marker.length).trim(), body: '' });
    else if (out.length) out.at(-1)!.body += line + '\n';
  }
  return out.map(c => ({ heading: c.heading, body: c.body.trim() }));
}

function labelAndTitle(heading: string): { label: string; title: string } {
  const i = heading.indexOf(': ');
  return { label: heading.slice(0, i), title: heading.slice(i + 2) };
}

function ballotTitle(id: string): string | undefined {
  const m = new RegExp(`<h3 id="${id}-ballot-title">Ballot Title</h3>\\s*<p>([\\s\\S]*?)</p>`).exec(html);
  return m?.[1]?.replace(/\s+/g, ' ').trim();
}

const measures: Measure[] = splitOn(blueBook, 1).map(({ heading, body }) => {
  const { label, title } = labelAndTitle(heading);
  const id = slug(label);
  const summary = body.split(/^## /m)[0]!.trim();
  const sections: Section[] = [];
  const figures: FigureRef[] = [];
  let voteMeaning: Measure['voteMeaning'];

  for (const s of splitOn(body, 2)) {
    if (s.heading === 'What Your Vote Means') {
      const paras = s.body.split(/\n\s*\n/).map(p => p.trim());
      voteMeaning = {
        yes: paras.find(p => /^A “yes” vote/.test(p)) ?? '',
        no: paras.find(p => /^A “no” vote/.test(p)) ?? '',
      };
      continue;
    }
    // Figures: ![caption](./fig-x.png) and the one plain link to a figure.
    const markdown = s.body.replace(/(!?)\[([^\]]*)\]\(\.\/(fig-[^)]+)\.png\)/g, (_all, bang: string, caption: string, figId: string) => {
      figures.push({ id: figId, page: 0, caption, section: s.heading });
      return `${bang}[${caption}](assets/${figId}.png)`;
    });
    sections.push({ heading: s.heading, markdown });
  }

  return { id, label, title, ballotTitle: ballotTitle(id), summary, voteMeaning, sections, figures, pages: [0, 0] };
});

const guide: Guide = {
  jurisdiction: 'Colorado',
  election: '2026',
  title: 'Colorado Ballot Initiative Voter Guide',
  sourceUrl: 'https://content.leg.colorado.gov/sites/default/files/2026-blue-book-en-accessible.pdf',
  measures,
};

const analyses: Analysis[] = splitOn(analysesMd, 1).map(({ heading, body }) => ({
  measureId: slug(labelAndTitle(heading).label),
  // Drop the "Oct 17, 2026 · @Greg" byline the Claude doc export left behind.
  markdown: body.replace(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · @\S+\n+/, '').trim(),
}));

await writeFile(join(dir, 'guide.json'), JSON.stringify(guide, null, 2) + '\n');
await mkdir(join(dir, 'analyses'), { recursive: true });
for (const a of analyses) await writeFile(join(dir, 'analyses', `${a.measureId}.md`), a.markdown + '\n');

console.log(`${measures.length} measures, ${analyses.length} analyses, ${measures.flatMap(m => m.figures).length} figures`);
for (const m of measures) if (!m.ballotTitle) console.warn(`No ballot title found for ${m.id}`);
