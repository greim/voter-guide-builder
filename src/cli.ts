import { existsSync } from 'node:fs';
import { Command, InvalidArgumentError } from 'commander';
import { defaultModel } from './claude.ts';
import { interactive } from './interactive.ts';
import { run, type RunOptions } from './pipeline.ts';

// Settings such as ANTHROPIC_API_KEY can live in a git-ignored .env file.
if (existsSync('.env')) process.loadEnvFile('.env');

const program = new Command('voter-guide-builder')
  .description('Turns an official ballot-measure booklet (PDF) into an HTML voter guide.')
  .showHelpAfterError()
  .helpCommand('help [command]', 'Show help for a command')
  .addHelpText(
    'after',
    `
Examples:
  npx voter-guide-builder interactive
  npx voter-guide-builder generate --pdf booklet.pdf --out ../greim.github.io/ballot-guides/colorado-2026
  npx voter-guide-builder generate --pdf booklet.pdf --out out/test --model dummy`,
  );

program
  .command('generate')
  .description('Generate a guide, with every choice given as options')
  .requiredOption('--pdf <url-or-path>', 'the official ballot-measure booklet, as a URL or a local file')
  .requiredOption('--out <folder>', 'folder to write index.html and assets/ into')
  .option('--source-url <url>', "the booklet's public URL, linked from the guide (default: --pdf when that's a URL)")
  .option(
    '--model <id>',
    'Claude model to use; another model\'s answers are cached separately, and "dummy" calls no model, answering with placeholders for free',
    defaultModel,
  )
  .option('--web-searches <n>', 'web searches each analysis may run; 0 turns search off', wholeNumber, 10)
  .option('--only <ids>', 'only these measures, comma-separated, e.g. amendment-81,proposition-nn', idList)
  .option(
    '--analysis-prompt <file>',
    'your own analysis prompt instead of prompts/analysis.md; it can use {{jurisdiction}}, {{election}} and {{measure}}, and the guide quotes it',
  )
  .option('--skip-verify', "render even if verify finds text that isn't in the booklet")
  .option('--cache <folder>', 'where stage outputs are kept between runs', 'cache')
  .action((o: RunOptions) => runOrExit(o));

program
  .command('interactive')
  .description('Generate a guide, answering a question for each choice')
  .action(async () => runOrExit(await interactive()));

if (process.argv.length <= 2) program.error('error: missing command');
await program.parseAsync();

async function runOrExit(o: RunOptions): Promise<void> {
  try {
    await run(o);
  } catch (err) {
    // Stage errors explain themselves; a stack trace only buries the message.
    console.error(`\n${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function wholeNumber(value: string): number {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError('Not a whole number.');
  return Number(value);
}

function idList(value: string): string[] {
  return value.split(',').map(id => id.trim()).filter(Boolean);
}
