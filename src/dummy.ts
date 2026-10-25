import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import * as mupdf from 'mupdf';

// --model dummy: stands in for Claude so the rest of the pipeline can be
// tested for free. It answers instantly with placeholder content of the right
// shape. Transcriptions copy lines from the pages they're given, so verify
// still has real booklet text to check.

/** How many placeholder measures the outline splits the booklet into. */
const measureCount = 3;

export function dummyJson(content: BetaContentBlockParam[], schema: Record<string, unknown>): unknown {
  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  if ('measures' in properties) return outline(content);
  if ('sections' in properties) return transcription(content);
  throw new Error('dummy model: no placeholder answer for this request');
}

export function dummyText(): string {
  return [
    '## What it does',
    'Placeholder analysis from the dummy model. Run without `--model dummy` for a real one.',
    '## Supporters and their reasoning',
    '- Placeholder point one.\n- Placeholder point two.',
    '## Opponents and their reasoning',
    '- Placeholder point one.\n- Placeholder point two.',
    '## Sources',
    '- [Example source](https://example.com/)',
  ].join('\n\n');
}

/** Splits the pages into a few measures of consecutive pages. */
function outline(content: BetaContentBlockParam[]) {
  const text = content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n');
  const pages = [...text.matchAll(/<page n="(\d+)">/g)].map(m => Number(m[1]));
  const size = Math.max(1, Math.ceil(pages.length / measureCount));
  const measures = [];
  for (let i = 0; i < pages.length; i += size) {
    const letter = String.fromCharCode(65 + measures.length);
    measures.push({ label: `Measure ${letter}`, title: `Placeholder Measure ${letter}`, pages: pages.slice(i, i + size) });
  }
  return { jurisdiction: 'Dummyland', election: '2099', measures };
}

/** One section per page, made of that page's first lines. */
function transcription(content: BetaContentBlockParam[]) {
  const block = content.find(b => b.type === 'document');
  if (!block || block.type !== 'document' || block.source.type !== 'base64') {
    throw new Error('dummy model: expected a PDF document');
  }
  const doc = mupdf.Document.openDocument(Buffer.from(block.source.data, 'base64'), 'application/pdf');
  const sections = [];
  const figures = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    // Read the same way extract reads the booklet, so verify sees the same text.
    const json = JSON.parse(page.toStructuredText('preserve-whitespace,preserve-images').asJSON()) as {
      blocks: { lines?: { text: string }[] }[];
    };
    const lines = json.blocks
      .flatMap(b => b.lines ?? [])
      .map(l => l.text.trim())
      // A lone letter is a list bullet, which can come out as a wrong letter
      // once a page is copied into a new PDF.
      .filter(l => l && !/^\p{L}$/u.test(l));
    if (!lines.length) continue;
    const heading = lines[0]!;
    let markdown = lines.slice(1, 8).join(' ');
    // A placeholder figure on the first page, to exercise the figures stage.
    if (i === 0) {
      figures.push({ page: 1, caption: `Placeholder figure`, section: heading });
      markdown += `\n\n![Placeholder figure](figure:1)`;
    }
    sections.push({ heading, markdown });
  }
  return {
    voteThreshold: '',
    ballotTitle: '',
    summary: '',
    voteYes: '',
    voteNo: '',
    sections,
    figures,
  };
}
