import type { ProductDescription, ModelDescription } from '../types';
import { chatCompletion, embeddings, imageGeneration } from './client';
import { DEFAULT_PRESET, PRESETS, resolvePreset, isValidModel } from './registry';
import {
  VISION_COMBINED_PROMPT,
  IDEAS_SYSTEM,
  IDEAS_USER,
  EXPAND_SYSTEM,
  EXPAND_USER,
} from './prompts';
import type { Idea } from '../types';
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

// ============================================================
// V2 FUNCTIONS — Studio Clean Flow
// ============================================================

interface VisionCombinedResult {
  productAnalysis: ProductDescription;
  modelAnalysis: ModelDescription | null;
}

export async function visionCombined(
  productImage: string,
  modelImage: string | null,
  brief: string,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<VisionCombinedResult> {
  const { vision } = cfg(config);
  const productImg = await normalizeImage(productImage);
  const modelImg = modelImage ? await normalizeImage(modelImage) : null;

  const userContent: LLMMessage['content'] = [
    {
      type: 'text',
      text: VISION_COMBINED_PROMPT(brief) + (modelImg
        ? '\n\n[Foto kedua adalah foto model.]'
        : '\n\n[Tidak ada foto model — beri persona suggestion.]'),
    },
    { type: 'image_url', image_url: { url: productImg } },
  ];
  if (modelImg) {
    userContent.push({ type: 'image_url', image_url: { url: modelImg } });
  }

  const parsed = await chat<{ productAnalysis: unknown; modelAnalysis: unknown }>(
    jobId,
    'vision',
    vision,
    [{ role: 'user', content: userContent }],
    { maxTokens: 1500, responseFormat: 'json_object', timeoutMs: 90_000 }
  );

  return {
    productAnalysis: parsed.productAnalysis as ProductDescription,
    modelAnalysis: parsed.modelAnalysis
      ? ({ ...(parsed.modelAnalysis as object), source: 'vision' } as ModelDescription)
      : null,
  };
}

export async function ideateFromImages(
  productAnalysis: ProductDescription,
  modelAnalysis: ModelDescription | null,
  brief: string,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<Idea[]> {
  const { ideas } = cfg(config);
  const parsed = await chat<{ ideas?: Idea[] }>(
    jobId,
    'ideas',
    ideas,
    [
      { role: 'system', content: IDEAS_SYSTEM },
      { role: 'user', content: IDEAS_USER(productAnalysis, modelAnalysis, brief) },
    ],
    { maxTokens: 2500, responseFormat: 'json_object', timeoutMs: 60_000 }
  );

  const result = parsed.ideas ?? [];
  if (!Array.isArray(result) || result.length < 2) {
    throw new LLMError('Ideation returned < 2 ideas', 'INVALID_RESPONSE', 'openrouter', ideas);
  }
  return result;
}

export async function expandToClips(
  productAnalysis: ProductDescription,
  modelAnalysis: ModelDescription | null,
  selectedIdea: Idea,
  brief: string,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<{ styleNotes: string; clips: Array<{ prompt: string }> }> {
  const { expand } = cfg(config);
  const parsed = await chat<{ styleNotes?: string; clips?: Array<{ prompt: string }> }>(
    jobId,
    'expand',
    expand,
    [
      { role: 'system', content: EXPAND_SYSTEM },
      { role: 'user', content: EXPAND_USER(productAnalysis, modelAnalysis, selectedIdea, brief) },
    ],
    { maxTokens: 3000, responseFormat: 'json_object', timeoutMs: 90_000 }
  );

  const styleNotes = parsed.styleNotes ?? '';
  const clips = parsed.clips ?? [];
  if (!Array.isArray(clips) || clips.length < 2) {
    throw new LLMError('Expand returned < 2 clips', 'INVALID_RESPONSE', 'openrouter', expand);
  }
  return { styleNotes, clips };
}
