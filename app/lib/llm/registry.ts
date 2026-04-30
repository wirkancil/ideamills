import type { LayerName, ModelConfig, PresetName } from './types';

export interface ModelEntry {
  id: string;
  label: string;
  tier: 'budget' | 'balanced' | 'premium';
  note?: string;
}

// Model IDs follow OpenRouter format: provider/model
// See https://openrouter.ai/api/v1/models for full list.
export const MODEL_REGISTRY: Record<LayerName, ModelEntry[]> = {
  vision: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
  ],

  ideation: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
  ],

  scripting: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
  ],

  visualPrompt: [
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
    { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2', tier: 'budget' },
  ],

  ideas: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'z-ai/glm-4.6:free', label: 'GLM 4.6 (free)', tier: 'budget', note: 'Free tier — rate-limited' },
    { id: 'x-ai/grok-4', label: 'Grok 4', tier: 'balanced' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
  ],

  expand: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'z-ai/glm-4.6:free', label: 'GLM 4.6 (free)', tier: 'budget', note: 'Free tier — rate-limited' },
    { id: 'x-ai/grok-4', label: 'Grok 4', tier: 'balanced' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
  ],
};

export const PRESETS: Record<Exclude<PresetName, 'custom'>, Omit<ModelConfig, 'preset'>> = {
  fast: {
    vision: 'google/gemini-2.5-flash',
    ideation: 'google/gemini-2.5-flash',
    scripting: 'google/gemini-2.5-flash',
    visualPrompt: 'google/gemini-2.5-flash',
    ideas: 'google/gemini-2.5-flash',
    expand: 'google/gemini-2.5-pro',
  },
  balanced: {
    vision: 'google/gemini-2.5-pro',
    ideation: 'google/gemini-2.5-flash',
    scripting: 'google/gemini-2.5-flash',
    visualPrompt: 'anthropic/claude-sonnet-4.6',
    ideas: 'google/gemini-2.5-flash',
    expand: 'deepseek/deepseek-v3.2-exp',
  },
  premium: {
    vision: 'anthropic/claude-sonnet-4.6',
    ideation: 'google/gemini-2.5-pro',
    scripting: 'google/gemini-2.5-pro',
    visualPrompt: 'anthropic/claude-sonnet-4.6',
    ideas: 'anthropic/claude-sonnet-4.6',
    expand: 'anthropic/claude-sonnet-4.6',
  },
};

export const DEFAULT_PRESET: Exclude<PresetName, 'custom'> = 'fast';

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
