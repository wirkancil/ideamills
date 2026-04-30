export type LayerName =
  | 'vision'
  | 'ideation'
  | 'embedding'
  | 'scripting'
  | 'visualPrompt'
  | 'text2img'
  | 'ideas'
  | 'expand';

export type PresetName = 'fast' | 'balanced' | 'premium' | 'custom';

export interface ModelConfig {
  preset: PresetName;
  vision: string;
  ideation: string;
  embedding: string;
  scripting: string;
  visualPrompt: string;
  text2img: string;
  ideas: string;
  expand: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

export interface LLMCallOptions {
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json_object' | 'text';
  timeoutMs?: number;
  fallbackModels?: string[];
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface LLMResponse<T = string> {
  data: T;
  raw: string;
  model: string;
  usage: LLMUsage;
  latencyMs: number;
}

export interface EmbeddingResponse {
  vectors: number[][];
  model: string;
  dim: number;
  usage: LLMUsage;
}

export interface ImageResponse {
  images: string[];
  model: string;
  latencyMs: number;
}

export interface ImageCallOptions {
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:5' | '2:3' | '3:2';
  size?: '0.5K' | '1K' | '2K' | '4K';
  n?: number;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: 'RATE_LIMIT' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'PROVIDER_ERROR' | 'NETWORK' | 'INVALID_MODEL',
    public readonly provider: string,
    public readonly model?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
