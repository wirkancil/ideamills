import type { ProductDescription, ModelDescription } from '../types';
import { chatCompletion, embeddings, imageGeneration } from './client';
import { DEFAULT_PRESET, PRESETS, resolvePreset, isValidModel } from './registry';
import {
  GENERIC_MODEL_PROMPT,
  IDEATION_SYSTEM,
  IDEATION_USER,
  SCRIPTING_SYSTEM,
  SCRIPTING_USER,
  VISION_MODEL_PROMPT,
  VISION_PRODUCT_PROMPT,
  VISUAL_PROMPT_SYSTEM,
  VISUAL_PROMPT_USER,
} from './prompts';
import {
  limit,
  logUsage,
  normalizeImage,
  parseJson,
  withRetry,
} from './middleware';
import {
  LLMError,
  type ImageCallOptions,
  type ImageResponse,
  type LLMMessage,
  type ModelConfig,
} from './types';

export { DEFAULT_PRESET, MODEL_REGISTRY, PRESETS, resolvePreset, isValidModel } from './registry';

import { getModelEntry } from './registry';
function getModelDim(modelId: string): number {
  const entry = getModelEntry('embedding', modelId);
  return entry?.dim ?? 1536;
}
export type { LayerName, ModelConfig, PresetName } from './types';

function cfg(config?: Partial<ModelConfig> & { preset?: ModelConfig['preset'] }): ModelConfig {
  const base = resolvePreset(config?.preset ?? DEFAULT_PRESET);
  return { ...base, ...config };
}

async function chat<T>(
  jobId: string | undefined,
  layer: string,
  model: string,
  messages: LLMMessage[],
  opts: {
    maxTokens: number;
    responseFormat?: 'json_object';
    fallback?: string[];
    concurrency?: number;
    timeoutMs?: number;
  }
): Promise<T> {
  return limit(`chat:${model}`, opts.concurrency ?? 5, async () => {
    const started = Date.now();
    const res = await withRetry(() =>
      chatCompletion(
        {
          model,
          models: opts.fallback,
          messages,
          max_tokens: opts.maxTokens,
          response_format: opts.responseFormat ? { type: opts.responseFormat } : undefined,
        },
        opts.timeoutMs ?? 120_000
      )
    );
    const latencyMs = Date.now() - started;
    const raw = res.choices[0]?.message?.content ?? '';

    logUsage({
      jobId,
      layer,
      model: res.model,
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
      latencyMs,
      costUsd: res.usage?.total_cost,
      createdAt: new Date(),
    });

    if (opts.responseFormat === 'json_object') {
      return parseJson<T>(raw);
    }
    return raw as unknown as T;
  });
}

export async function visionDescribeProduct(
  imageInput: string,
  basicIdea?: string,
  visualDescription?: string,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<ProductDescription> {
  const { vision } = cfg(config);
  const image = await normalizeImage(imageInput);

  let prompt = VISION_PRODUCT_PROMPT;
  if (basicIdea?.trim()) prompt += `\n\nContext - Product Idea: "${basicIdea}"`;
  if (visualDescription?.trim()) prompt += `\n\nVisual Description/Overrides: "${visualDescription}"`;

  const parsed = await chat<Record<string, unknown>>(jobId, 'vision', vision, [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: image } },
      ],
    },
  ], { maxTokens: 1000, responseFormat: 'json_object', timeoutMs: 60_000 });

  const normalized = { ...parsed } as Record<string, unknown>;
  if (normalized.benefits && !normalized.key_benefit) {
    normalized.key_benefit = normalized.benefits;
    delete normalized.benefits;
  }
  if (normalized.visual_notes && !normalized.additional_notes) {
    normalized.additional_notes = normalized.visual_notes;
    delete normalized.visual_notes;
  }
  if (!normalized.notable_text) normalized.notable_text = '';

  return normalized as unknown as ProductDescription;
}

export async function visionDescribeModel(
  imageInput: string,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<ModelDescription> {
  const { vision } = cfg(config);
  const image = await normalizeImage(imageInput);

  const parsed = await chat<Record<string, unknown>>(jobId, 'vision', vision, [
    {
      role: 'user',
      content: [
        { type: 'text', text: VISION_MODEL_PROMPT },
        { type: 'image_url', image_url: { url: image } },
      ],
    },
  ], { maxTokens: 1000, responseFormat: 'json_object', timeoutMs: 60_000 });

  return { ...parsed, source: 'vision' } as unknown as ModelDescription;
}

export async function genericModelDescribe(
  basicIdea: string,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<ModelDescription> {
  const { ideation } = cfg(config);
  const parsed = await chat<Record<string, unknown>>(jobId, 'ideation', ideation, [
    { role: 'user', content: GENERIC_MODEL_PROMPT(basicIdea) },
  ], { maxTokens: 300, responseFormat: 'json_object' });

  return { ...parsed, source: 'generic' } as unknown as ModelDescription;
}

export async function ideation50(
  product: ProductDescription,
  basicIdea: string,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<string[]> {
  const { ideation } = cfg(config);
  const parsed = await chat<unknown>(jobId, 'ideation', ideation, [
    { role: 'system', content: IDEATION_SYSTEM },
    { role: 'user', content: IDEATION_USER(product, basicIdea) },
  ], { maxTokens: 2000, responseFormat: 'json_object' });

  return extractIdeasArray(parsed);
}

function extractIdeasArray(parsed: unknown): string[] {
  if (Array.isArray(parsed)) return parsed as string[];
  if (!parsed || typeof parsed !== 'object') return [];
  const p = parsed as Record<string, unknown>;

  if (Array.isArray(p.ideas)) return p.ideas as string[];
  if (Array.isArray(p.marketing_angles)) return p.marketing_angles as string[];

  if (Array.isArray(p.angles)) {
    const angles = p.angles as unknown[];
    if (angles.length > 0 && typeof angles[0] === 'object' && angles[0] && 'angles' in (angles[0] as object)) {
      return angles.flatMap((c) => ((c as { angles?: string[] }).angles ?? []));
    }
    return angles as string[];
  }

  if (Array.isArray(p.categories)) {
    return (p.categories as Array<{ angles?: string[] }>).flatMap((c) => c.angles ?? []);
  }
  return [];
}

export async function script5(
  theme: string,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<unknown[]> {
  const { scripting } = cfg(config);
  const parsed = await chat<{ scripts?: unknown[] }>(jobId, 'scripting', scripting, [
    { role: 'system', content: SCRIPTING_SYSTEM },
    { role: 'user', content: SCRIPTING_USER(theme) },
  ], { maxTokens: 2500, responseFormat: 'json_object' });

  return parsed.scripts ?? [];
}

export async function enrichVisualPrompts(
  product: ProductDescription,
  model: ModelDescription,
  overrides: string,
  scripts: unknown[],
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<unknown[]> {
  const { visualPrompt } = cfg(config);
  const chunkSize = 25;
  const out: unknown[] = [];

  for (let i = 0; i < scripts.length; i += chunkSize) {
    const chunk = scripts.slice(i, i + chunkSize);
    const parsed = await chat<{ scripts?: unknown[]; directors_script?: unknown }>(
      jobId,
      'visualPrompt',
      visualPrompt,
      [
        { role: 'system', content: VISUAL_PROMPT_SYSTEM },
        { role: 'user', content: VISUAL_PROMPT_USER(product, model, overrides, chunk) },
      ],
      { maxTokens: 12000, responseFormat: 'json_object', timeoutMs: 180_000 }
    );
    const enriched = parsed.scripts ?? (parsed.directors_script ? [parsed] : []);
    out.push(...enriched);
  }

  return out;
}

export async function embedBatch(
  texts: string[],
  batchSize = 50,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<number[][]> {
  const { embedding: model } = cfg(config);
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const started = Date.now();
    try {
      const res = await withRetry(() =>
        embeddings({ model, input: batch, input_type: 'clustering' })
      );
      vectors.push(...res.data.map((d) => d.embedding));

      logUsage({
        jobId,
        layer: 'embedding',
        model: res.model,
        promptTokens: res.usage.prompt_tokens,
        completionTokens: 0,
        latencyMs: Date.now() - started,
        createdAt: new Date(),
      });
    } catch (err) {
      const dim = vectors[0]?.length ?? getModelDim(model);
      vectors.push(...batch.map(() => new Array(dim).fill(0)));
    }
  }

  return vectors;
}

export async function embedSingle(
  text: string,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<number[]> {
  const [vec] = await embedBatch([text], 1, config, jobId);
  return vec;
}

// Models that use OpenAI-style /images/generations endpoint (not chat completions)
// Gemini image models use chat completions — they go to the else branch below
const IMAGES_API_MODELS = new Set<string>([]);

export async function generateImage(
  prompt: string,
  options: ImageCallOptions = {},
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<ImageResponse> {
  const { text2img } = cfg(config);
  const started = Date.now();

  if (!IMAGES_API_MODELS.has(text2img) && !isValidModel('text2img', text2img)) {
    throw new LLMError(`Invalid text2img model: ${text2img}`, 'INVALID_MODEL', 'openrouter', text2img);
  }

  if (IMAGES_API_MODELS.has(text2img)) {
    const res = await withRetry(() =>
      imageGeneration({
        model: text2img,
        prompt,
        n: 1,
        response_format: 'b64_json',
      })
    );

    const raw = res.data[0];
    const imageUrl = raw?.b64_json
      ? `data:image/jpeg;base64,${raw.b64_json}`
      : raw?.url ?? '';

    if (!imageUrl) {
      throw new LLMError('No images returned from provider', 'INVALID_RESPONSE', 'openrouter', text2img);
    }

    logUsage({
      jobId,
      layer: 'text2img',
      model: res.model ?? text2img,
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: 0,
      latencyMs: Date.now() - started,
      costUsd: res.usage?.total_cost,
      createdAt: new Date(),
    });

    return { images: [imageUrl], model: res.model ?? text2img, latencyMs: Date.now() - started };
  }

  // Gemini and other chat-based image models
  const res = await withRetry(() =>
    chatCompletion({
      model: text2img,
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image', 'text'],
      image_config: {
        aspect_ratio: options.aspectRatio ?? '1:1',
        image_size: options.size ?? '1K',
      },
    })
  );

  const images = (res.choices[0]?.message?.images ?? []).map((img) => img.image_url.url);
  if (images.length === 0) {
    throw new LLMError('No images returned from provider', 'INVALID_RESPONSE', 'openrouter', text2img);
  }

  logUsage({
    jobId,
    layer: 'text2img',
    model: res.model,
    promptTokens: res.usage?.prompt_tokens ?? 0,
    completionTokens: 0,
    latencyMs: Date.now() - started,
    costUsd: res.usage?.total_cost,
    createdAt: new Date(),
  });

  return { images, model: res.model, latencyMs: Date.now() - started };
}
