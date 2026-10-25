import { existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { checkbox, confirm, input, number, select } from '@inquirer/prompts';
import { defaultModel, models } from './claude.ts';
import type { RunOptions } from './pipeline.ts';
import { fetchBooklet } from './stages/fetch.ts';
import { slug } from './stages/render.ts';

// The `interactive` command: asks for each of generate's options, then shows the
// matching generate command, so the same run can be repeated without questions.

export async function interactive(): Promise<RunOptions> {
  try {
    return await ask();
  } catch (err) {
    if (err instanceof Error && err.name === 'ExitPromptError') process.exit(130); // Ctrl+C
    throw err;
  }
}

async function ask(): Promise<RunOptions> {
  const pdf = await input({
    message: 'Official booklet PDF (URL or file path):',
    required: true,
    validate: v => isUrl(v) || existsSync(v) || 'No such file.',
  });
  const sourceUrl = isUrl(pdf)
    ? undefined
    : (await input({
        message: "The booklet's public URL, linked from the guide (optional):",
        validate: v => !v || isUrl(v) || 'Enter a URL starting with http:// or https://.',
      })) || undefined;
  const name = basename(isUrl(pdf) ? new URL(pdf).pathname : pdf, extname(pdf));
  const out = await input({ message: 'Folder to write the guide into:', default: join('out', slug(name) || 'guide'), required: true });
  const cache = await input({ message: 'Folder for cached stage outputs:', default: 'cache', required: true });
  const model = await select({
    message: 'Model:',
    choices: models.map(m => ({ name: `${m.id} (${m.description})`, value: m.id })),
    default: defaultModel,
  });
  const webSearches =
    model === 'dummy'
      ? 10
      : await number({ message: 'Web searches per analysis (0 turns search off):', default: 10, min: 0, step: 1, required: true });

  let only: string[] | undefined;
  const ids = await cachedMeasureIds(pdf, cache, model);
  if (ids) {
    const chosen = await checkbox({
      message: 'Measures (space toggles one, enter accepts):',
      choices: ids.map(id => ({ value: id, checked: true })),
      required: true,
    });
    if (chosen.length < ids.length) only = chosen;
  } else {
    console.log("  All measures: they're listed here once a run has found them.");
  }

  const analysisPrompt =
    (await input({
      message: 'Your own analysis prompt file (empty for prompts/analysis.md):',
      validate: v => !v || existsSync(v) || 'No such file.',
    })) || undefined;
  const skipVerify = await select({
    message: "If verify finds guide text that isn't in the booklet:",
    choices: [
      { name: 'Stop, so I can review it', value: false },
      { name: 'Render the guide anyway', value: true },
    ],
  });

  const o: RunOptions = { pdf, out, cache, sourceUrl, skipVerify, analysisPrompt, model, webSearches, only };
  console.log(`\nThe same run without the questions:\n\n  ${generateCommand(o)}\n`);
  if (!(await confirm({ message: 'Run it now?', default: true }))) process.exit(0);
  return o;
}

/** The measures a previous run found in this booklet, or undefined before the first run. */
async function cachedMeasureIds(pdf: string, cacheRoot: string, model: string): Promise<string[] | undefined> {
  try {
    const cache = await fetchBooklet(pdf, cacheRoot);
    // Where structure keeps the outline for this model (see cached() in structure.ts).
    const file = model !== 'dummy' && (await cache.has('outline.json')) ? ['outline.json'] : ['by-model', model, 'outline.json'];
    if (!(await cache.has(...file))) return undefined;
    const outline = await cache.readJson<{ measures: { label: string }[] }>(...file);
    return outline.measures.map(m => slug(m.label));
  } catch {
    return undefined;
  }
}

function generateCommand(o: RunOptions): string {
  const args = ['npx voter-guide-builder generate', '--pdf', quote(o.pdf), '--out', quote(o.out)];
  if (o.sourceUrl) args.push('--source-url', quote(o.sourceUrl));
  if (o.model !== defaultModel) args.push('--model', o.model);
  if (o.webSearches !== 10) args.push('--web-searches', String(o.webSearches));
  if (o.only) args.push('--only', o.only.join(','));
  if (o.analysisPrompt) args.push('--analysis-prompt', quote(o.analysisPrompt));
  if (o.skipVerify) args.push('--skip-verify');
  if (o.cache !== 'cache') args.push('--cache', quote(o.cache));
  return args.join(' ');
}

function quote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

function isUrl(s: string): boolean {
  return /^https?:\/\//.test(s);
}
