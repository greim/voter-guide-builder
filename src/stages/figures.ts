import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as mupdf from 'mupdf';
import type { Cache } from '../cache.ts';
import { askJson, imageBlock, mapLimit, settings, textBlock } from '../claude.ts';
import { prompt } from '../prompts.ts';
import type { FigureRef, Guide } from '../schema.ts';
import type { PageText } from './extract.ts';
import { cached } from './structure.ts';

// Stage 6: each chart or diagram cropped from the booklet as a PNG, so the
// guide shows the original graphic rather than a redrawing.
//   1. Claude looks at the page and gives a rough box around the graphic,
//      leaving out its caption (the guide prints the caption as text).
//      Cached as figures/<id>.json, in PDF points; edit it to fix a crop.
//   2. Code snaps that box to the edges of what's drawn there: every line of
//      text, shape and image mostly inside it, minus lines of the caption.
//   3. The box is rendered at 3x (about 216 dpi) to figures/<id>.png.

/** Pixels per PDF point in the PNGs. */
const scale = 3;
/** Pixels per PDF point in the page image Claude looks at. */
const lookScale = 1.5;
/** Points of margin around the graphic, where there's room. */
const pad = 4;

type Rect = [number, number, number, number];

export interface FigureBox {
  page: number;
  /** Claude's rough box, [x0, y0, x1, y1] in PDF points. */
  rough: Rect;
  /** If set, used as is instead of snapping `rough`. */
  exact?: Rect;
}

interface BoxReply {
  found: boolean;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const boxSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'left', 'top', 'right', 'bottom'],
  properties: {
    found: { type: 'boolean' },
    left: { type: 'integer' },
    top: { type: 'integer' },
    right: { type: 'integer' },
    bottom: { type: 'integer' },
  },
};

/** Writes <dir>/<figure id>.png for every figure and returns the dir. */
export async function figures(cache: Cache, guide: Guide, pages: PageText[]): Promise<string> {
  const doc = mupdf.Document.openDocument(await readFile(cache.path('booklet.pdf')), 'application/pdf');
  // The dummy model's figures are made up, so they're kept apart.
  const dir = settings.model === 'dummy' ? cache.path('by-model', 'dummy', 'figures') : cache.path('figures');
  await mkdir(dir, { recursive: true });
  const figs = guide.measures.flatMap(m => m.figures);
  await mapLimit(figs, 4, async fig => {
    const page = doc.loadPage(fig.page - 1);
    const found = await cached<FigureBox>(cache, `figures/${fig.id}.json`, async () => {
      console.log(`      ${fig.caption} (page ${fig.page})`);
      return { page: fig.page, rough: await findFigure(page, fig) };
    });
    const box = found.exact ?? snap(page, pages[fig.page - 1]!, found.rough, fig.caption);
    await writeFile(`${dir}/${fig.id}.png`, crop(page, box));
  });
  return dir;
}

async function findFigure(page: mupdf.Page, fig: FigureRef): Promise<Rect> {
  const png = page.toPixmap(mupdf.Matrix.scale(lookScale, lookScale), mupdf.ColorSpace.DeviceRGB).asPNG();
  const reply = await askJson<BoxReply>({
    name: `figures: ${fig.caption}`,
    content: [imageBlock(png), textBlock(await prompt('figure-box', { caption: fig.caption }))],
    schema: boxSchema,
    effort: 'low',
  });
  if (!reply.found) {
    throw new Error(
      `figures: "${fig.caption}" isn't on page ${fig.page}. Fix its page in the measure's figures list ` +
        `(measures/<id>.json in the cache) and re-run.`,
    );
  }
  return [reply.left, reply.top, reply.right, reply.bottom].map(v => v / lookScale) as Rect;
}

/**
 * The smallest box holding everything drawn mostly inside `rough`, except
 * the caption's lines, plus a little margin that stops short of the text
 * left out.
 */
export function snap(page: mupdf.Page, text: PageText, rough: Rect, caption: string): Rect {
  const captionWords = new Set(words(caption));
  const isCaption = (line: string) => words(line).length > 0 && words(line).every(w => captionWords.has(w));

  let box: Rect | undefined;
  const add = (r: Rect) => (box = box ? union(box, r) : r);
  const inside = (r: Rect) => {
    const g: Rect = [r[0] - 0.5, r[1] - 0.5, r[2] + 0.5, r[3] + 0.5]; // so lines have an area
    return area(intersect(g, rough)) >= area(g) / 2;
  };

  const leftOut: Rect[] = [];
  for (const b of text.blocks) {
    if (b.type !== 'text') continue;
    for (const l of b.lines) {
      if (!l.text.trim()) continue; // draws nothing, and can be page-sized
      const r: Rect = [l.bbox[0], l.bbox[1], l.bbox[0] + l.bbox[2], l.bbox[1] + l.bbox[3]];
      if (inside(r) && !isCaption(l.text)) add(r);
      else leftOut.push(r);
    }
  }
  for (const r of drawings(page)) if (inside(r)) add(r);
  const b = box ?? rough;

  // Text boxes include the font's ascent and descent, so neighboring lines
  // overlap. Where a left-out line is close, the edge goes in the blank gap
  // between its glyphs and the graphic's, found on the rendered page.
  const ink = inkMap(page);
  const edge: Rect = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
  for (const r of leftOut) {
    const cx = (r[0] + r[2]) / 2;
    const cy = (r[1] + r[3]) / 2;
    const overlapsX = r[0] < b[2] && r[2] > b[0];
    const overlapsY = r[1] < b[3] && r[3] > b[1];
    if (overlapsX && cy < b[1]) edge[1] = Math.max(edge[1], ink.gap('row', cy, b[1] + (b[3] - b[1]) / 2, b[0], b[2]) ?? (r[3] + b[1]) / 2);
    if (overlapsX && cy > b[3]) edge[3] = Math.min(edge[3], ink.gap('row', cy, b[3] - (b[3] - b[1]) / 2, b[0], b[2]) ?? (r[1] + b[3]) / 2);
    if (overlapsY && cx < b[0]) edge[0] = Math.max(edge[0], ink.gap('col', cx, b[0] + (b[2] - b[0]) / 2, b[1], b[3]) ?? (r[2] + b[0]) / 2);
    if (overlapsY && cx > b[2]) edge[2] = Math.min(edge[2], ink.gap('col', cx, b[2] - (b[2] - b[0]) / 2, b[1], b[3]) ?? (r[0] + b[2]) / 2);
  }
  return edge;
}

/** Bounds of every shape and image drawn on the page. */
function drawings(page: mupdf.Page): Rect[] {
  const out: Rect[] = [];
  const noStroke = new mupdf.StrokeState({ lineCap: 'Butt', lineJoin: 'Miter', lineWidth: 0, miterLimit: 10 });
  const device = new mupdf.Device({
    fillPath: (path, _evenOdd, ctm, _cs, color) => {
      if (!isWhite(color)) out.push(path.getBounds(noStroke, ctm) as Rect);
    },
    strokePath: (path, stroke, ctm) => out.push(path.getBounds(stroke, ctm) as Rect),
    fillImage: (_image, ctm) => out.push(mupdf.Rect.transform([0, 0, 1, 1], ctm) as Rect),
  });
  page.run(device, mupdf.Matrix.identity);
  device.close();
  return out;
}

/** White fills are usually backgrounds, which would make a box too big. */
function isWhite(color: number[]): boolean {
  return color.length === 4 ? color.every(c => c < 0.02) : color.every(c => c > 0.98);
}

/** Which pixels of the rendered page have ink, to find blank gaps. */
function inkMap(page: mupdf.Page) {
  const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
  const px = pix.getPixels();
  const stride = pix.getStride();
  const [w, h] = [pix.getWidth(), pix.getHeight()];
  const inked = (x: number, y: number) => {
    const i = y * stride + x * 3;
    return px[i]! < 235 || px[i + 1]! < 235 || px[i + 2]! < 235;
  };
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, Math.round(v * scale)));
  return {
    /**
     * Walking rows (or columns) from `from` toward `to`, in points, the first
     * blank one between `lo` and `hi` across, or undefined if none.
     */
    gap(axis: 'row' | 'col', from: number, to: number, lo: number, hi: number): number | undefined {
      const [len, across] = axis === 'row' ? [h, w] : [w, h];
      const [a, b] = [clamp(lo, across), clamp(hi, across)];
      const step = to > from ? 1 : -1;
      for (let i = clamp(from, len); i !== clamp(to, len); i += step) {
        let blank = true;
        for (let j = a; j <= b && blank; j++) blank = !(axis === 'row' ? inked(j, i) : inked(i, j));
        if (blank) return i / scale;
      }
      return undefined;
    },
  };
}

function crop(page: mupdf.Page, box: Rect): Uint8Array {
  const bounds = box.map((v, i) => (i < 2 ? Math.floor(v * scale) : Math.ceil(v * scale))) as Rect;
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bounds, false);
  pix.clear(255);
  const device = new mupdf.DrawDevice(mupdf.Matrix.scale(scale, scale), pix);
  page.run(device, mupdf.Matrix.identity);
  device.close();
  return pix.asPNG();
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function area(r: Rect): number {
  return Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
}

function intersect(a: Rect, b: Rect): Rect {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
}

function union(a: Rect, b: Rect): Rect {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
