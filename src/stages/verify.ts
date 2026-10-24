import type { Cache } from '../cache.ts';
import type { Guide, Measure } from '../schema.ts';
import { pageText, pagesText, type PageText } from './extract.ts';

// Stage 4: check the structure stage copied the booklet faithfully, by
// comparing each measure's words with the PDF text of its pages.
//   - Words in the guide but not the PDF are the dangerous kind (Claude
//     added or reworded something), so any of them stops the pipeline.
//   - Words in the PDF but not the guide are expected (page headers, legal
//     text, other measures sharing a page), so they are only reported.
// Punctuation, case and quote styles are ignored. verify-report.txt lists
// everything for review.

/** Left-out runs this long or longer are listed in the report. */
const reportMissingRun = 15;

interface Run {
  words: string[];
  /** A few matching words before the run, to find it. */
  before: string[];
}

export interface MeasureCheck {
  id: string;
  /** How many of the guide's words were found in the PDF. */
  matched: number;
  guideWords: number;
  added: Run[];
}

interface LeftOut extends Run {
  page: number;
}

export async function verify(cache: Cache, guide: Guide, pages: PageText[]): Promise<MeasureCheck[]> {
  const checks = guide.measures.map(m => checkMeasure(m, pages));
  await cache.writeText(report(checks, leftOut(guide, pages)), 'verify-report.txt');
  const failed = checks.filter(c => c.added.length);
  if (failed.length) {
    throw new Error(
      `verify: text in ${failed.map(c => c.id).join(', ')} isn't in the booklet. ` +
        `See ${cache.path('verify-report.txt')}, then fix or delete measures/<id>.json in the cache and re-run ` +
        `(or pass --skip-verify to accept it).`,
    );
  }
  return checks;
}

export function checkMeasure(m: Measure, pages: PageText[]): MeasureCheck {
  const pdf = words(pagesText(pages, m.pages));
  const check: MeasureCheck = { id: m.id, matched: 0, guideWords: 0, added: [] };
  const pdfGrams = new Map<number, Set<string>>();
  const gramsOf = (n: number) => pdfGrams.get(n) ?? pdfGrams.set(n, grams(pdf, n)).get(n)!;

  // Each field and section is checked on its own, and a word counts as found
  // when some run of n words around it appears in the booklet. So the guide
  // may order things differently from the booklet, but a changed or inserted
  // word can't hide by matching a stray word elsewhere on the page.
  for (const part of measureParts(m)) {
    const ours = words(part);
    const n = Math.min(gram, ours.length);
    check.guideWords += ours.length;
    const found = covered(ours, n, gramsOf(n));
    check.matched += found.filter(Boolean).length;
    check.added.push(...runs(ours, found, 1));
  }
  return check;
}

/**
 * Text on the measures' pages that no measure used, page by page. Neighboring
 * measures often share a page, so this is reported once for the whole guide.
 */
function leftOut(guide: Guide, pages: PageText[]): LeftOut[] {
  const used = new Set(guide.measures.flatMap(m => measureParts(m).flatMap(p => [...grams(words(p), gram)])));
  const measurePages = new Set(guide.measures.flatMap(m => m.pages));
  return pages
    .filter(p => measurePages.has(p.page))
    .flatMap(p => {
      const ws = words(pageText(p));
      return runs(ws, covered(ws, gram, used), reportMissingRun).map(r => ({ ...r, page: p.page }));
    });
}

/** Words in a row that make up one n-gram. */
export const gram = 4;

export function grams(ws: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' '));
  return out;
}

/** Marks each word that sits inside some n-gram from `known`. */
export function covered(ws: string[], n: number, known: Set<string>): boolean[] {
  const found = new Array<boolean>(ws.length).fill(false);
  for (let i = 0; i + n <= ws.length; i++) {
    if (known.has(ws.slice(i, i + n).join(' '))) found.fill(true, i, i + n);
  }
  return found;
}

/** Runs of at least `min` words not marked found. */
export function runs(ws: string[], found: boolean[], min: number): Run[] {
  const out: Run[] = [];
  let start = -1;
  for (let i = 0; i <= ws.length; i++) {
    if (i < ws.length && !found[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start >= min) out.push({ words: ws.slice(start, i), before: ws.slice(Math.max(0, start - 5), start) });
      start = -1;
    }
  }
  return out;
}

/** Everything the guide shows for a measure as booklet text, as plain text per field and section. */
export function measureParts(m: Measure): string[] {
  const parts = [m.voteThreshold, m.ballotTitle, m.summary, m.voteMeaning?.yes, m.voteMeaning?.no];
  for (const s of m.sections) parts.push(`${s.heading}\n${s.markdown}`);
  return parts
    .filter((p): p is string => p !== undefined)
    .map(p =>
      p
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images: alt text isn't booklet text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links: keep the text, drop the URL
        .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, ''), // table divider rows
    );
}

export function words(text: string): string[] {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      // "government-issued", and words hyphenated across a line break, become one word.
      .replace(/(\p{L})[-\u2010\u2011\u00ad](?:\s*\n\s*)?(\p{L})/gu, '$1$2')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function report(checks: MeasureCheck[], left: LeftOut[]): string {
  const out: string[] = [];
  for (const c of checks) {
    const pct = c.guideWords ? ((100 * c.matched) / c.guideWords).toFixed(1) : '0';
    out.push(`== ${c.id}: ${pct}% of ${c.guideWords} guide words found in the booklet`);
    for (const r of c.added) out.push(`  NOT IN BOOKLET: …${r.before.join(' ')} [+ ${r.words.join(' ')} +]`);
  }
  out.push('', `== Booklet text left out of the guide (runs of ${reportMissingRun}+ words)`);
  for (const r of left) {
    const shown = r.words.length > 24 ? [...r.words.slice(0, 12), '…', ...r.words.slice(-8)] : r.words;
    out.push(`  page ${r.page}, ${r.words.length} words: …${r.before.join(' ')} [- ${shown.join(' ')} -]`);
  }
  return out.join('\n') + '\n';
}
