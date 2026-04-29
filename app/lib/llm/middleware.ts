import { GridFSBucket, ObjectId } from 'mongodb';
import { getDb } from '../mongoClient';
import { LLMError } from './types';
import { acquireToken, releaseToken } from './rateLimiter';

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable =
        err instanceof LLMError &&
        (err.code === 'RATE_LIMIT' || err.code === 'PROVIDER_ERROR' || err.code === 'NETWORK');
      if (!retryable || attempt === maxAttempts) throw err;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 10_000);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function cleanJson(text: string): string {
  let cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  const firstOpen = Math.min(
    ...[cleaned.indexOf('{'), cleaned.indexOf('[')].filter((i) => i !== -1),
  );
  if (!isFinite(firstOpen)) return cleaned;
  const isArray = cleaned[firstOpen] === '[';
  const lastClose = cleaned.lastIndexOf(isArray ? ']' : '}');
  if (firstOpen !== -1 && lastClose !== -1) {
    cleaned = cleaned.substring(firstOpen, lastClose + 1);
  }
  return cleaned;
}

export function parseJson<T = unknown>(raw: string | null | undefined): T {
  if (!raw) throw new LLMError('Empty response from LLM', 'INVALID_RESPONSE', 'openrouter');
  try {
    return JSON.parse(raw) as T;
  } catch {
    const cleaned = cleanJson(raw);
    try {
      return JSON.parse(cleaned) as T;
    } catch (err) {
      throw new LLMError(
        `Failed to parse JSON: ${(err as Error).message}. Raw: ${raw.slice(0, 200)}`,
        'INVALID_RESPONSE',
        'openrouter'
      );
    }
  }
}

/**
 * Convert any image input to base64 data URI.
 * Supports: existing base64 data URIs, HTTP(S) URLs, and GridFS-backed localhost URLs.
 */
export async function normalizeImage(input: string, mimeType = 'image/jpeg'): Promise<string> {
  if (input.startsWith('data:image/')) return input;

  if (input.includes('localhost') || input.includes('127.0.0.1')) {
    const id = input.split('/').pop();
    if (id && ObjectId.isValid(id)) {
      try {
        const db = await getDb();
        const bucket = new GridFSBucket(db, { bucketName: process.env.MONGODB_BUCKET || 'images' });
        const chunks: Buffer[] = [];
        for await (const chunk of bucket.openDownloadStream(new ObjectId(id))) {
          chunks.push(chunk as Buffer);
        }
        const buffer = Buffer.concat(chunks);
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
      } catch {
        // fall through to HTTP fetch
      }
    }
  }

  const res = await fetch(input);
  if (!res.ok) {
    throw new LLMError(
      `Failed to fetch image (${res.status}): ${input}`,
      'NETWORK',
      'openrouter'
    );
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export interface LogEntry {
  jobId?: string;
  layer: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costUsd?: number;
  createdAt: Date;
}

export async function logUsage(entry: LogEntry): Promise<void> {
  try {
    const db = await getDb();
    await db.collection('llm_usage').insertOne(entry);
  } catch (err) {
    console.warn('[llm] failed to log usage:', (err as Error).message);
  }
}

/**
 * Global distributed semaphore backed by MongoDB.
 * All worker processes share the same token bucket — prevents OpenRouter rate limit
 * storms when multiple jobs run in parallel across multiple worker instances.
 */
export async function limit<T>(key: string, concurrency: number, fn: () => Promise<T>): Promise<T> {
  await acquireToken(key, concurrency);
  try {
    return await fn();
  } finally {
    await releaseToken(key);
  }
}
