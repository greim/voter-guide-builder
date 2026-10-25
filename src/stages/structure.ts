import { readFile } from 'node:fs/promises';
import * as mupdf from 'mupdf';
import type { Cache } from '../cache.ts';
import { askJson, defaultModel, mapLimit, pdfBlock, settings, textBlock } from '../claude.ts';
import { prompt } from '../prompts.ts';
import type { FigureRef, Guide, Measure, Section } from '../schema.ts';
import { slug } from './render.ts';
import { pageText, type PageText } from './extract.ts';

// Stage 3: Claude turns the booklet into the Guide schema, in two steps.
//   1. outline.json: the measures and which pages mention each, from the
//      extracted text (cheap, and small enough to read whole). Booklets often
//      spread a measure out: Colorado's has a quick-reference YES/NO section,
//      the analyses, then ballot titles with the legal text.
//   2. measures/<id>.json: each measure transcribed from a PDF of just its
//      pages, so Claude sees the layout (tables, charts) and the reply stays
//      well under the output limit.
// Both are cached, so a bad measure can be deleted (or edited) and redone
// alone. guide.json is rebuilt from them on every run, for reading only.

interface Outline {
  jurisdiction: string;
  election: string;
  measures: { label: string; title: string; pages: number[] }[];
}

const outlineSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['jurisdiction', 'election', 'measures'],
  properties: {
    jurisdiction: { type: 'string' },
    election: { type: 'string' },
    measures: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'title', 'pages'],
        properties: {
          label: { type: 'string' },
          title: { type: 'string' },
          pages: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
  },
};

/** What Claude returns per measure; structure.ts turns it into a Measure. */
interface MeasureReply {
  voteThreshold: string;
  ballotTitle: string;
  summary: string;
  voteYes: string;
  voteNo: string;
  sections: Section[];
  figures: { page: number; caption: string; section: string }[];
}

const measureSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['voteThreshold', 'ballotTitle', 'summary', 'voteYes', 'voteNo', 'sections', 'figures'],
  properties: {
    voteThreshold: { type: 'string' },
    ballotTitle: { type: 'string' },
    summary: { type: 'string' },
    voteYes: { type: 'string' },
    voteNo: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'markdown'],
        properties: { heading: { type: 'string' }, markdown: { type: 'string' } },
      },
    },
    figures: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['page', 'caption', 'section'],
        properties: { page: { type: 'integer' }, caption: { type: 'string' }, section: { type: 'string' } },
      },
    },
  },
};

export interface StructureOptions {
  /** Where readers can get the booklet; defaults to the URL it was fetched from. */
  sourceUrl?: string;
  /** Measure ids to keep (e.g. "amendment-81"); the rest are skipped. */
  only?: string[];
}

export async function structure(cache: Cache, pages: PageText[], { sourceUrl, only }: StructureOptions = {}): Promise<Guide> {
  const outline = await cached(cache, 'outline.json', () => findMeasures(pages));
  checkOutline(outline, pages.length);

  let entries = outline.measures;
  if (only) {
    const ids = entries.map(e => slug(e.label));
    const unknown = only.filter(id => !ids.includes(id));
    if (unknown.length) throw new Error(`--only: no measure ${unknown.join(', ')}. The measures are ${ids.join(', ')}`);
    entries = entries.filter(e => only.includes(slug(e.label)));
  }

  const booklet = new mupdf.PDFDocument(await readFile(cache.path('booklet.pdf')));
  const measures = await mapLimit(entries, 4, async entry => {
    const id = slug(entry.label);
    const reply = await cached(cache, `measures/${id}.json`, async () => {
      console.log(`      ${entry.label}: pages ${pageList(entry.pages)}`);
      return transcribe(booklet, entry);
    });
    return toMeasure(id, entry, reply);
  });

  const { source } = await cache.readJson<{ source: string }>('source.json');
  const guide: Guide = {
    jurisdiction: outline.jurisdiction,
    election: outline.election,
    title: `${outline.jurisdiction} ${outline.election} Ballot Measure Voter Guide`,
    sourceUrl: sourceUrl ?? (/^https?:\/\//.test(source) ? source : ''),
    measures,
  };
  await cache.writeJson(guide, 'guide.json');
  return guide;
}

/**
 * Answers from another model (--model) are cached apart from the default
 * model's, but the default model's are used when they exist, since they're
 * the ones verify has passed.
 */
async function cached<T>(cache: Cache, file: string, compute: () => Promise<T>): Promise<T> {
  const parts = file.split('/');
  if (settings.model === defaultModel || (await cache.has(...parts))) return cache.json(parts, compute);
  return cache.json(['by-model', settings.model, ...parts], compute);
}

async function findMeasures(pages: PageText[]): Promise<Outline> {
  const text = pages.map(p => `<page n="${p.page}">\n${pageText(p)}\n</page>`).join('\n');
  return askJson<Outline>({
    name: 'structure: outline',
    content: [textBlock(await prompt('structure-outline', {})), textBlock(text)],
    schema: outlineSchema,
    effort: 'medium',
  });
}

function checkOutline(outline: Outline, pageCount: number): void {
  if (!outline.measures.length) throw new Error('structure: no measures found; see outline.json in the cache');
  for (const m of outline.measures) {
    m.pages = [...new Set(m.pages)].sort((a, b) => a - b);
    if (!m.pages.length || m.pages[0]! < 1 || m.pages.at(-1)! > pageCount) {
      throw new Error(`structure: ${m.label} has pages "${pageList(m.pages)}", not within 1-${pageCount}; fix outline.json in the cache`);
    }
  }
}

/** e.g. "7, 15-18, 69" */
function pageList(pages: number[]): string {
  const ranges: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j]! + 1) j++;
    ranges.push(i === j ? `${pages[i]}` : `${pages[i]}-${pages[j]}`);
    i = j;
  }
  return ranges.join(', ');
}

async function transcribe(booklet: mupdf.PDFDocument, entry: Outline['measures'][number]): Promise<MeasureReply> {
  const pdf = new mupdf.PDFDocument();
  for (const p of entry.pages) pdf.graftPage(-1, booklet, p - 1);
  const vars = { label: entry.label, title: entry.title, pages: pageList(entry.pages) };
  return askJson<MeasureReply>({
    name: `structure: ${entry.label}`,
    content: [pdfBlock(pdf.saveToBuffer('garbage=compact,compress').asUint8Array()), textBlock(await prompt('structure-measure', vars))],
    schema: measureSchema,
  });
}

function toMeasure(id: string, entry: Outline['measures'][number], reply: MeasureReply): Measure {
  const figures: FigureRef[] = reply.figures.map((f, i) => ({
    id: `fig-${id}-${i + 1}`,
    page: entry.pages[f.page - 1] ?? entry.pages[0]!,
    caption: f.caption,
    section: f.section,
  }));
  // Claude writes figure:N for the Nth figure; the page links assets/<id>.png.
  const sections = reply.sections.map(s => ({
    heading: s.heading,
    markdown: s.markdown.replace(/\]\(figure:(\d+)\)/g, (all, n: string) => {
      const fig = figures[Number(n) - 1];
      return fig ? `](assets/${fig.id}.png)` : all;
    }),
  }));
  const optional = (s: string) => s.trim() || undefined;
  return {
    id,
    label: entry.label,
    title: entry.title,
    voteThreshold: optional(reply.voteThreshold),
    ballotTitle: optional(reply.ballotTitle),
    summary: optional(reply.summary),
    voteMeaning: reply.voteYes.trim() || reply.voteNo.trim() ? { yes: reply.voteYes, no: reply.voteNo } : undefined,
    sections,
    figures,
    pages: entry.pages,
  };
}
