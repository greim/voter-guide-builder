import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Guide } from './schema.ts';

const promptsDir = join(import.meta.dirname, '..', 'prompts');

/** Reads prompts/<name>.md, or a path, without its <!-- comments -->. */
export async function loadPrompt(nameOrPath: string): Promise<string> {
  const file = /[\\/]|\.md$/.test(nameOrPath) ? nameOrPath : join(promptsDir, `${nameOrPath}.md`);
  return (await readFile(file, 'utf8')).replace(/<!--[\s\S]*?-->/g, '').trim();
}

/** Fills {{placeholders}} in a prompt. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_all, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`A prompt uses {{${key}}}, which wasn't provided`);
    return value;
  });
}

/** Reads prompts/<name>.md and fills its {{placeholders}}. */
export async function prompt(name: string, vars: Record<string, string>): Promise<string> {
  return fill(await loadPrompt(name), vars);
}

/** The analysis prompt as shown above the analyses on the page. */
export function analysisPromptForPage(guide: Guide, template: string): string {
  return fill(template, { jurisdiction: guide.jurisdiction, election: guide.election, measure: 'each initiative' });
}
