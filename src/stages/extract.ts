import { readFile } from 'node:fs/promises';
import * as mupdf from 'mupdf';
import type { Cache } from '../cache.ts';

// Stage 2: the booklet's text with positions, page by page, via mupdf. The
// structure stage reads it to find the measures, verify compares against it,
// and figures uses the image positions to crop.

export interface PageText {
  /** 1-based page number. */
  page: number;
  width: number;
  height: number;
  blocks: Block[];
}

export type Block =
  | { type: 'text'; bbox: Box; lines: Line[] }
  | { type: 'image'; bbox: Box };

export interface Line {
  text: string;
  bbox: Box;
  size: number;
  bold: boolean;
}

/** [x, y, width, height] in PDF points, origin top left. */
export type Box = [number, number, number, number];

export async function extract(cache: Cache): Promise<PageText[]> {
  return cache.json(['pages.json'], async () => {
    const doc = openBooklet(await readFile(cache.path('booklet.pdf')));
    const pages: PageText[] = [];
    for (let i = 0; i < doc.countPages(); i++) pages.push(readPage(doc.loadPage(i), i + 1));
    return pages;
  });
}

export function openBooklet(bytes: Uint8Array): mupdf.Document {
  return mupdf.Document.openDocument(bytes, 'application/pdf');
}

function readPage(page: mupdf.Page, n: number): PageText {
  const [x0, y0, x1, y1] = page.getBounds();
  const json = JSON.parse(page.toStructuredText('preserve-whitespace,preserve-images').asJSON()) as StextPage;
  const blocks: Block[] = json.blocks.map(b => {
    if (b.type === 'image') return { type: 'image', bbox: box(b.bbox) };
    return {
      type: 'text',
      bbox: box(b.bbox),
      lines: (b.lines ?? []).map(l => ({
        text: l.text,
        bbox: box(l.bbox),
        size: l.font.size,
        bold: l.font.weight === 'bold',
      })),
    };
  });
  return { page: n, width: x1 - x0, height: y1 - y0, blocks };
}

function box(b: StextBox): Box {
  return [b.x, b.y, b.w, b.h];
}

/** A page's text, one line per PDF line. */
export function pageText(p: PageText): string {
  return p.blocks.flatMap(b => (b.type === 'text' ? b.lines.map(l => l.text.trim()) : [])).join('\n');
}

/** Text of the given pages (1-based), in booklet order. */
export function pagesText(pages: PageText[], which: number[]): string {
  return pages.filter(p => which.includes(p.page)).map(pageText).join('\n');
}

// The parts of mupdf's structured-text JSON used here.
interface StextBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface StextPage {
  blocks: {
    type: 'text' | 'image';
    bbox: StextBox;
    lines?: { bbox: StextBox; text: string; font: { size: number; weight: string } }[];
  }[];
}
