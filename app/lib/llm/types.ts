export type LayerName =
  | 'vision'
  | 'ideation'
  | 'scripting'
  | 'visualPrompt'
  | 'ideas'
  | 'expand';

export type PresetName = 'fast' | 'balanced' | 'premium' | 'custom';

export interface ModelConfig {
  preset: PresetName;
  vision: string;
  ideation: string;
  scripting: string;
  visualPrompt: string;
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
