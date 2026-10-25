import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { dummyJson, dummyText } from './dummy.ts';

// The one place the pipeline talks to Claude. Credentials come from the
// environment (ANTHROPIC_API_KEY, or a profile from `ant auth login`).

export const defaultModel = 'claude-opus-5-5';

/**
 * Set from --model. A cheaper model (e.g. claude-haiku-5-5) makes test runs
 * cheap, and "dummy" answers with placeholders without calling Claude.
 */
export const settings = { model: defaultModel };

/** The models offered by `interactive`, most to least expensive. --model takes any model id. */
export const models = [
  { id: 'claude-opus-5-5', description: 'the best analyses; costs the most' },
  { id: 'claude-sonnet-5-5', description: 'good analyses for less' },
  { id: 'claude-haiku-5-5', description: 'cheapest; for test runs' },
  { id: 'dummy', description: 'free; no AI calls, placeholder answers' },
];

// Haiku has no server-side refusal fallback and only the basic web search tool.
const isHaiku = () => settings.model.startsWith('claude-haiku');
const fallbacks = () =>
  isHaiku() ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
const webSearchTool = (maxUses: number) =>
  isHaiku()
    ? { type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: maxUses }
    : { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: maxUses };

let client: Anthropic | undefined;

export interface JsonRequest {
  /** What the call is for, used in error messages, e.g. "structure: Amendment 81". */
  name: string;
  content: BetaContentBlockParam[];
  /** JSON Schema the reply must match (structured outputs). */
  schema: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/** Sends one user turn and returns Claude's reply parsed as JSON matching `schema`. */
export async function askJson<T>({ name, content, schema, effort = 'high' }: JsonRequest): Promise<T> {
  if (settings.model === 'dummy') return dummyJson(content, schema) as T;
  const message = await call(name, () =>
    api()
      .beta.messages.stream({
        model: settings.model,
        max_tokens: 64000,
        // If a safety classifier declines, the server retries on a fallback model
        // instead of failing the run.
        ...fallbacks(),
        output_config: { effort, format: { type: 'json_schema', schema } },
        messages: [{ role: 'user', content }],
      })
      .finalMessage(),
  );

  if (message.stop_reason === 'refusal') {
    throw new Error(`${name}: Claude declined (${message.stop_details?.category ?? 'no category'})`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error(`${name}: the reply hit max_tokens before it was complete`);
  }
  const text = message.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
  return JSON.parse(text) as T;
}

export interface TextRequest {
  /** What the call is for, used in error messages, e.g. "analyze: Amendment 81". */
  name: string;
  content: BetaContentBlockParam[];
  /** Let Claude search the web, up to this many searches. */
  webSearches?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/** Sends one user turn and returns Claude's written reply (its text blocks, joined). */
export async function askText({ name, content, webSearches = 0, effort = 'high' }: TextRequest): Promise<string> {
  if (settings.model === 'dummy') return dummyText();
  const messages: BetaMessageParam[] = [{ role: 'user', content }];
  const text: string[] = [];
  let message: BetaMessage;
  // A turn with web searches can pause partway; resending it continues where
  // it stopped, so the reply's text is collected across rounds.
  for (let rounds = 0; ; rounds++) {
    message = await call(name, () =>
      api()
        .beta.messages.stream({
          model: settings.model,
          max_tokens: 64000,
          ...fallbacks(),
          output_config: { effort },
          tools: webSearches ? [webSearchTool(webSearches)] : undefined,
          messages,
        })
        .finalMessage(),
    );
    for (const b of message.content) if (b.type === 'text') text.push(b.text);
    if (message.stop_reason !== 'pause_turn') break;
    if (rounds >= 5) throw new Error(`${name}: still paused after ${rounds + 1} rounds`);
    messages.push({ role: 'assistant', content: message.content });
  }

  if (message.stop_reason === 'refusal') {
    throw new Error(`${name}: Claude declined (${message.stop_details?.category ?? 'no category'})`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error(`${name}: the reply hit max_tokens before it was complete`);
  }
  return text.join('').trim();
}

function api(): Anthropic {
  return (client ??= new Anthropic());
}

/**
 * Runs one API request, turning a failure into a message a person can act
 * on. The SDK's own message is the raw JSON response.
 */
async function call<T>(name: string, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (err) {
    if (!(err instanceof Anthropic.AnthropicError)) throw err;
    const body = err instanceof Anthropic.APIError ? (err.error as { error?: { message?: string } } | undefined) : undefined;
    const detail = body?.error?.message ?? err.message;
    const hint = errorHint(err, detail);
    const said = err instanceof Anthropic.APIError && err.status ? 'the Anthropic API said: ' : '';
    throw new Error(`${name}: ${said}${detail}${hint ? `\n${hint}` : ''}`);
  }
}

const cached = 'Work that finished is cached, so a re-run picks up where this one stopped.';

function errorHint(err: InstanceType<typeof Anthropic.AnthropicError>, detail: string): string | undefined {
  if (/credit balance/i.test(detail)) {
    return `Add credits at https://console.anthropic.com/settings/billing, then re-run. ${cached}`;
  }
  if (err instanceof Anthropic.AuthenticationError || /api.?key/i.test(detail)) {
    return 'Check ANTHROPIC_API_KEY (in .env or your shell). Keys are at https://console.anthropic.com/settings/keys.';
  }
  if (err instanceof Anthropic.NotFoundError && /model/i.test(detail)) return `Check --model ("${settings.model}").`;
  if (err instanceof Anthropic.APIConnectionError) return `Couldn't reach the API; check your internet connection. ${cached}`;
  if (err instanceof Anthropic.RateLimitError) return `Rate limited even after retrying; wait a minute and re-run. ${cached}`;
  if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) {
    return `Anthropic's servers had a problem; re-run in a few minutes. ${cached}`;
  }
  return undefined;
}

export function pdfBlock(bytes: Uint8Array): BetaContentBlockParam {
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') },
  };
}

export function imageBlock(png: Uint8Array): BetaContentBlockParam {
  return { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(png).toString('base64') } };
}

export function textBlock(text: string): BetaContentBlockParam {
  return { type: 'text', text };
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
