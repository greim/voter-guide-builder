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
  client ??= new Anthropic();
  const stream = client.beta.messages.stream({
    model: settings.model,
    max_tokens: 64000,
    // If a safety classifier declines, the server retries on a fallback model
    // instead of failing the run.
    ...fallbacks(),
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  });
  const message = await stream.finalMessage();

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
  client ??= new Anthropic();
  const messages: BetaMessageParam[] = [{ role: 'user', content }];
  const text: string[] = [];
  let message: BetaMessage;
  // A turn with web searches can pause partway; resending it continues where
  // it stopped, so the reply's text is collected across rounds.
  for (let rounds = 0; ; rounds++) {
    message = await client.beta.messages
      .stream({
        model: settings.model,
        max_tokens: 64000,
        ...fallbacks(),
        output_config: { effort },
        tools: webSearches ? [webSearchTool(webSearches)] : undefined,
        messages,
      })
      .finalMessage();
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

export function pdfBlock(bytes: Uint8Array): BetaContentBlockParam {
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') },
  };
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
