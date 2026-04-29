import type { LayerName, ModelConfig, PresetName } from './types';

export interface ModelEntry {
  id: string;
  label: string;
  tier: 'budget' | 'balanced' | 'premium';
  dim?: number;
  note?: string;
}

export const MODEL_REGISTRY: Record<LayerName, ModelEntry[]> = {
  vision: [
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
  ],

  ideation: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
  ],

  embedding: [
    { id: 'openai/text-embedding-3-small', label: 'OpenAI Small', tier: 'budget', dim: 1536 },
    { id: 'openai/text-embedding-3-large', label: 'OpenAI Large', tier: 'premium', dim: 3072 },
    { id: 'qwen/qwen3-embedding-8b', label: 'Qwen3 Embedding 8B', tier: 'balanced', dim: 1024, note: 'Multilingual, context 32K' },
    { id: 'baai/bge-m3', label: 'BGE-M3', tier: 'budget', dim: 1024, note: 'Multilingual 100+ langs' },
    { id: 'intfloat/multilingual-e5-large', label: 'Multilingual E5 Large', tier: 'balanced', dim: 1024, note: 'Multilingual 90+ langs' },
    { id: 'google/gemini-embedding-001', label: 'Gemini Embedding 001', tier: 'premium', dim: 768, note: 'MTEB top-ranked, multilingual' },
    { id: 'nvidia/llama-nemotron-embed-vl-1b-v2:free', label: 'Nemotron Embed (Free)', tier: 'budget', dim: 1024, note: 'Free, context 131K' },
  ],

  scripting: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
  ],

  visualPrompt: [
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
    { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', tier: 'budget' },
  ],

  text2img: [
    { id: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image', tier: 'balanced' },
    { id: 'google/gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (Preview)', tier: 'premium' },
  ],
};

export const PRESETS: Record<Exclude<PresetName, 'custom'>, Omit<ModelConfig, 'preset'>> = {
  fast: {
    vision: 'google/gemini-2.5-flash',
    ideation: 'google/gemini-2.5-flash',
    embedding: 'openai/text-embedding-3-small',
    scripting: 'google/gemini-2.5-flash',
    visualPrompt: 'deepseek/deepseek-v3.2',
    text2img: 'google/gemini-2.5-flash-image',
  },
  balanced: {
    vision: 'google/gemini-2.5-pro',
    ideation: 'google/gemini-2.5-flash',
    embedding: 'openai/text-embedding-3-small',
    scripting: 'google/gemini-2.5-flash',
    visualPrompt: 'anthropic/claude-sonnet-4.6',
    text2img: 'google/gemini-2.5-flash-image',
  },
  premium: {
    vision: 'anthropic/claude-sonnet-4.6',
    ideation: 'google/gemini-2.5-pro',
    embedding: 'openai/text-embedding-3-large',
    scripting: 'google/gemini-2.5-pro',
    visualPrompt: 'anthropic/claude-sonnet-4.6',
    text2img: 'google/gemini-3.1-flash-image-preview',
  },
};

export const DEFAULT_PRESET: Exclude<PresetName, 'custom'> = 'balanced';

export function resolvePreset(preset: PresetName = DEFAULT_PRESET): ModelConfig {
  if (preset === 'custom') {
    return { preset: 'custom', ...PRESETS[DEFAULT_PRESET] };
  }
  return { preset, ...PRESETS[preset] };
}

export function isValidModel(layer: LayerName, modelId: string): boolean {
  return MODEL_REGISTRY[layer].some((m) => m.id === modelId);
}

export function getModelEntry(layer: LayerName, modelId: string): ModelEntry | undefined {
  return MODEL_REGISTRY[layer].find((m) => m.id === modelId);
}
