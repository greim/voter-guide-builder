// Renders the Colorado 2026 fixture without running any earlier stage.
// Run: npm run render-fixture -- <out folder>   (default: out/colorado-2026)

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analysisPromptForPage } from '../src/prompts.ts';
import { analysisPrompt as loadAnalysisPrompt } from '../src/stages/analyze.ts';
import type { Analysis, Guide } from '../src/schema.ts';
import { printPdf } from '../src/stages/pdf.ts';
import { render } from '../src/stages/render.ts';

const dir = join(import.meta.dirname, '..', 'fixtures', 'colorado-2026');
const outDir = process.argv[2] ?? join('out', 'colorado-2026');

const guide = JSON.parse(await readFile(join(dir, 'guide.json'), 'utf8')) as Guide;
const analyses: Analysis[] = [];
for (const file of (await readdir(join(dir, 'analyses'))).sort()) {
  analyses.push({ measureId: file.replace(/\.md$/, ''), markdown: await readFile(join(dir, 'analyses', file), 'utf8') });
}
const analysisPrompt = analysisPromptForPage(guide, (await loadAnalysisPrompt()).template);

await render({ guide, analyses, analysisPrompt, figuresDir: dir }, outDir);
console.log(`Wrote ${join(outDir, 'index.html')} and ${await printPdf(outDir)}`);
