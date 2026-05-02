import type { ProductDescription, ModelDescription } from '../types';
import { chatCompletion } from './client';
import { DEFAULT_PRESET, PRESETS, resolvePreset, isValidModel } from './registry';
import {
  VISION_COMBINED_PROMPT,
  IDEAS_SYSTEM,
  IDEAS_USER,
  EXPAND_SYSTEM,
  EXPAND_USER,
  ENHANCE_PROMPT_SYSTEM,
  ENHANCE_PROMPT_USER,
  SUGGEST_EXTEND_SYSTEM,
  SUGGEST_EXTEND_USER,
  CLEAN_VEO_SYSTEM,
  CLEAN_VEO_USER,
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
  type LLMMessage,
  type ModelConfig,
} from './types';

export { DEFAULT_PRESET, MODEL_REGISTRY, PRESETS, resolvePreset, isValidModel } from './registry';

export type { LayerName, ModelConfig, PresetName } from './types';

function cfg(config?: Partial<ModelConfig> & { preset?: ModelConfig['preset'] }): ModelConfig {
  const base = resolvePreset(config?.preset ?? DEFAULT_PRESET);
  return { ...base, ...config };
}

async function chat<T>(
  ctx: { jobId?: string; generationId?: string } | undefined,
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
    // Wrap entire call (chat + parse) in withRetry so truncated JSON also triggers retry.
    return withRetry(async () => {
      const started = Date.now();
      const res = await chatCompletion(
        {
          model,
          models: opts.fallback,
          messages,
          max_tokens: opts.maxTokens,
          response_format: opts.responseFormat ? { type: opts.responseFormat } : undefined,
        },
        opts.timeoutMs ?? 120_000
      );
      const latencyMs = Date.now() - started;
      const raw = res.choices[0]?.message?.content ?? '';
      const finishReason = res.choices[0]?.finish_reason;

      // Treat non-stop finish_reasons as retryable provider errors.
      if (finishReason && finishReason !== 'stop' && finishReason !== 'tool_calls') {
        throw new LLMError(
          `OpenRouter response truncated (finish_reason=${finishReason}, model=${res.model})`,
          'PROVIDER_ERROR',
          'openrouter',
          model
        );
      }

      logUsage({
        jobId: ctx?.jobId,
        generationId: ctx?.generationId,
        layer,
        model: res.model,
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
        latencyMs,
        costUsd: res.usage?.cost ?? res.usage?.total_cost,
        createdAt: new Date(),
      });

      if (opts.responseFormat === 'json_object') {
        try {
          return parseJson<T>(raw);
        } catch (err) {
          console.error(
            `[llm] JSON parse failed — model=${res.model} finish_reason=${finishReason} raw_length=${raw.length} completion_tokens=${res.usage?.completion_tokens}`
          );
          throw err;
        }
      }
      return raw as unknown as T;
    });
  });
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
  ctx?: { jobId?: string; generationId?: string }
): Promise<VisionCombinedResult> {
  const { vision } = cfg(config);
  const productImg = await normalizeImage(productImage);
  const modelImg = modelImage ? await normalizeImage(modelImage) : null;

  const userContent: LLMMessage['content'] = [
    {
      type: 'text',
      text: VISION_COMBINED_PROMPT(brief, !!modelImg),
    },
    { type: 'image_url', image_url: { url: productImg } },
  ];
  if (modelImg) {
    userContent.push({ type: 'image_url', image_url: { url: modelImg } });
  }

  const parsed = await chat<{ productAnalysis: unknown; modelAnalysis: unknown }>(
    ctx,
    'vision',
    vision,
    [{ role: 'user', content: userContent }],
    { maxTokens: 3000, responseFormat: 'json_object', timeoutMs: 90_000 }
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
  ctx?: { jobId?: string; generationId?: string }
): Promise<Idea[]> {
  const { ideas } = cfg(config);
  const parsed = await chat<{ ideas?: Idea[] }>(
    ctx,
    'ideas',
    ideas,
    [
      { role: 'system', content: IDEAS_SYSTEM },
      { role: 'user', content: IDEAS_USER(productAnalysis, modelAnalysis, brief) },
    ],
    { maxTokens: 8000, responseFormat: 'json_object', timeoutMs: 120_000 }
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
  config?: Partial<ModelConfig>,
  ctx?: { jobId?: string; generationId?: string }
): Promise<{ productNotes: string; styleNotes: string; clips: Array<{ prompt: string }> }> {
  const { expand } = cfg(config);
  const parsed = await chat<{ productNotes?: string; styleNotes?: string; clips?: Array<{ prompt: string }> }>(
    ctx,
    'expand',
    expand,
    [
      { role: 'system', content: EXPAND_SYSTEM },
      { role: 'user', content: EXPAND_USER(productAnalysis, modelAnalysis, selectedIdea) },
    ],
    { maxTokens: 8000, responseFormat: 'json_object', timeoutMs: 120_000 }
  );

  const productNotes = parsed.productNotes ?? '';
  const styleNotes = parsed.styleNotes ?? '';
  const clips = parsed.clips ?? [];
  if (!Array.isArray(clips) || clips.length < 1) {
    throw new LLMError('Expand returned 0 clips', 'INVALID_RESPONSE', 'openrouter', expand);
  }
  return { productNotes, styleNotes, clips };
}

/**
 * Enhance a Veo prompt by flipping negations to positive phrasing.
 * Single LLM call, returns rewritten prompt as plain text.
 */
export async function enhanceVeoPrompt(
  rawPrompt: string,
  config?: Partial<ModelConfig>,
  ctx?: { jobId?: string; generationId?: string }
): Promise<string> {
  const { expand } = cfg(config);
  const result = await chat<string>(
    ctx,
    'expand',
    expand,
    [
      { role: 'system', content: ENHANCE_PROMPT_SYSTEM },
      { role: 'user', content: ENHANCE_PROMPT_USER(rawPrompt) },
    ],
    { maxTokens: 1000, timeoutMs: 60_000 }
  );

  // chat<string> returns raw text when responseFormat not 'json_object'
  const enhanced = (result as string).trim();
  if (!enhanced) {
    throw new LLMError('Empty enhanced prompt', 'INVALID_RESPONSE', 'openrouter', expand);
  }
  return enhanced;
}

export async function suggestExtendPrompt(
  sourcePrompt: string,
  ideaContent: string,
  styleNotes: string,
  _config?: Partial<ModelConfig>,
  ctx?: { jobId?: string; generationId?: string }
): Promise<string> {
  const result = await chat<string>(
    ctx,
    'expand',
    'google/gemini-2.5-flash',
    [
      { role: 'system', content: SUGGEST_EXTEND_SYSTEM },
      { role: 'user', content: SUGGEST_EXTEND_USER(sourcePrompt, ideaContent, styleNotes) },
    ],
    { maxTokens: 2000, timeoutMs: 30_000 }
  );
  let prompt = (result as string).trim();

  // Strip reasoning leakage — ambil hanya bagian setelah "Continuation prompt:" jika ada
  const continuationMatch = prompt.match(/continuation prompt[:\s]+([\s\S]+)/i);
  if (continuationMatch) {
    prompt = continuationMatch[1].trim();
  }
  // Jika masih ada numbered list atau reasoning header, ambil paragraf terakhir saja
  if (/^\d+\.|INTERNAL REASONING/i.test(prompt)) {
    const paragraphs = prompt.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    prompt = paragraphs[paragraphs.length - 1] ?? prompt;
  }

  if (!prompt) {
    throw new LLMError('Empty extend prompt suggestion', 'INVALID_RESPONSE', 'openrouter', 'google/gemini-2.5-flash');
  }
  return prompt;
}

export async function cleanVeoPrompt(
  rawPrompt: string,
  ctx?: { jobId?: string; generationId?: string }
): Promise<string> {
  const result = await chat<string>(
    ctx,
    'expand',
    'google/gemini-2.5-flash',
    [
      { role: 'system', content: CLEAN_VEO_SYSTEM },
      { role: 'user', content: CLEAN_VEO_USER(rawPrompt) },
    ],
    { maxTokens: 1500, timeoutMs: 30_000 }
  );
  const cleaned = (result as string).trim();
  if (!cleaned) {
    throw new LLMError('Empty cleaned prompt', 'INVALID_RESPONSE', 'openrouter', 'google/gemini-2.5-flash');
  }
  return cleaned;
}
