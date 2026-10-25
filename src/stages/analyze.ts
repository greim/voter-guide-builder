import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Cache } from '../cache.ts';
import { askText, mapLimit, settings, textBlock } from '../claude.ts';
import { fill, loadPrompt } from '../prompts.ts';
import type { Analysis, Guide, Measure } from '../schema.ts';

// Stage 5: one Claude call per measure, with web search, using the analysis
// prompt (prompts/analysis.md unless --analysis-prompt names another file).
// The prompt is shown on the page; prompts/analysis-format.md adds the page's
// formatting needs and isn't. Analyses are cached under a fingerprint of both
// prompts, the model and the search limit, so changing any of them writes
// fresh ones.

export interface AnalysisPrompt {
  /** The prompt template, with {{jurisdiction}}, {{election}} and {{measure}}. */
  template: string;
  format: string;
}

export async function analysisPrompt(file = 'analysis'): Promise<AnalysisPrompt> {
  return { template: await loadPrompt(file), format: await loadPrompt('analysis-format') };
}

/** `webSearches`: how many searches each analysis may run; 0 turns search off. */
export async function analyze(cache: Cache, guide: Guide, p: AnalysisPrompt, webSearches = 10): Promise<Analysis[]> {
  const key = createHash('sha256')
    .update(`${settings.model}\n${webSearches}\n${p.template}\n${p.format}`)
    .digest('hex')
    .slice(0, 12);
  if (!(await cache.has('analyses', key, 'prompt.md'))) {
    await cache.writeText(`${p.template}\n\n---\n\n${p.format}\n`, 'analyses', key, 'prompt.md');
  }
  return mapLimit(guide.measures, 4, async m => {
    const file = ['analyses', key, `${m.id}.md`];
    if (!(await cache.has(...file))) {
      console.log(`      ${m.label}`);
      const vars = { jurisdiction: guide.jurisdiction, election: guide.election, measure: `${m.label}: ${m.title}` };
      const markdown = await askText({
        name: `analyze: ${m.label}`,
        content: [textBlock(`${fill(p.template, vars)}\n\n${fill(p.format, { research: research(webSearches) })}`), textBlock(officialText(m))],
        webSearches,
      });
      await cache.writeText(`${markdown}\n`, ...file);
    }
    return { measureId: m.id, markdown: (await readFile(cache.path(...file), 'utf8')).trim() };
  });
}

function research(webSearches: number): string {
  return webSearches
    ? "You're free to search online for more detail."
    : "Web search isn't available, so rely on the official text and what you already know, and say where your information may be out of date.";
}

/** The measure as the guide shows it, as one Markdown document. */
export function officialText(m: Measure): string {
  const parts = [`# ${m.label}: ${m.title}`];
  if (m.voteThreshold) parts.push(m.voteThreshold);
  if (m.ballotTitle) parts.push('## Ballot Title', m.ballotTitle);
  if (m.summary) parts.push(m.summary);
  if (m.voteMeaning) parts.push('## What Your Vote Means', m.voteMeaning.yes, m.voteMeaning.no);
  for (const s of m.sections) {
    parts.push(`## ${s.heading}`, s.markdown.replace(/!\[([^\]]*)\]\([^)]*\)/g, '[Figure: $1]'));
  }
  return parts.join('\n\n');
}
