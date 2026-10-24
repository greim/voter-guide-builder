import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';

// The one place the pipeline talks to Claude. Credentials come from the
// environment (ANTHROPIC_API_KEY, or a profile from `ant auth login`).

export const model = 'claude-opus-5-5';

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
  client ??= new Anthropic();
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 64000,
    // If a safety classifier declines, the server retries on a fallback model
    // instead of failing the run.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
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
