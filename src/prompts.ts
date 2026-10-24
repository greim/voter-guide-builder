import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Guide } from './schema.ts';

const promptsDir = join(import.meta.dirname, '..', 'prompts');

/** Reads prompts/<name>.md without its leading comment and fills {{placeholders}}. */
export async function prompt(name: string, vars: Record<string, string>): Promise<string> {
  const template = (await readFile(join(promptsDir, `${name}.md`), 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
  return template.replace(/\{\{(\w+)\}\}/g, (_all, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`prompts/${name}.md uses {{${key}}}, which wasn't provided`);
    return value;
  }).trim();
}

/** The analysis prompt as shown above the analyses on the page. */
export function analysisPromptForPage(guide: Guide): Promise<string> {
  return prompt('analysis', { jurisdiction: guide.jurisdiction, election: guide.election, measure: 'each initiative' });
}
