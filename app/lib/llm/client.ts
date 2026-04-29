import { LLMError } from './types';
import type { LLMMessage } from './types';

const BASE_URL = 'https://openrouter.ai/api/v1';

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new LLMError(
      'OPENROUTER_API_KEY not set in environment',
      'PROVIDER_ERROR',
      'openrouter'
    );
  }
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'X-Title': 'IdeaMills',
  };
}

export interface ChatCompletionRequest {
  model: string;
  models?: string[];
  messages: LLMMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: 'json_object' | 'text' };
  modalities?: Array<'text' | 'image'>;
  image_config?: {
    aspect_ratio?: string;
    image_size?: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      images?: Array<{ image_url: { url: string } }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    total_cost?: number;
  };
}

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  response_format?: 'url' | 'b64_json';
}

export interface ImageGenerationResponse {
  data: Array<{ url?: string; b64_json?: string }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    total_cost?: number;
  };
}

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
  dimensions?: number;
  encoding_format?: 'float' | 'base64';
  input_type?: 'search_query' | 'search_document' | 'classification' | 'clustering';
}

export interface EmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

async function request<TReq, TRes>(
  path: string,
  body: TReq,
  timeoutMs: number
): Promise<TRes> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      const code =
        res.status === 429 ? 'RATE_LIMIT' : res.status >= 500 ? 'PROVIDER_ERROR' : 'INVALID_RESPONSE';
      throw new LLMError(
        `OpenRouter ${res.status}: ${text.slice(0, 500)}`,
        code,
        'openrouter',
        (body as { model?: string })?.model
      );
    }

    return (await res.json()) as TRes;
  } catch (err) {
    if (err instanceof LLMError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new LLMError(
        `OpenRouter timeout after ${timeoutMs}ms`,
        'TIMEOUT',
        'openrouter',
        (body as { model?: string })?.model
      );
    }
    throw new LLMError(
      `OpenRouter network error: ${(err as Error).message}`,
      'NETWORK',
      'openrouter',
      (body as { model?: string })?.model,
      err
    );
  } finally {
    clearTimeout(timer);
  }
}

export function chatCompletion(
  body: ChatCompletionRequest,
  timeoutMs = 120_000
): Promise<ChatCompletionResponse> {
  return request<ChatCompletionRequest, ChatCompletionResponse>(
    '/chat/completions',
    body,
    timeoutMs
  );
}

export function embeddings(
  body: EmbeddingRequest,
  timeoutMs = 60_000
): Promise<EmbeddingResponse> {
  return request<EmbeddingRequest, EmbeddingResponse>('/embeddings', body, timeoutMs);
}

export function imageGeneration(
  body: ImageGenerationRequest,
  timeoutMs = 120_000
): Promise<ImageGenerationResponse> {
  return request<ImageGenerationRequest, ImageGenerationResponse>('/images/generations', body, timeoutMs);
}
