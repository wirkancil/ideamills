# OpenRouter Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrasi total LLM provider dari LLMGateway ke OpenRouter, image generation pindah ke useapi.net (Google Flow Imagen), embedding dihapus.

**Architecture:** `client.ts` di-rewrite untuk hit OpenRouter base URL dengan format model `provider/model`. `registry.ts` di-rewrite dengan model OpenRouter only. `useapi.ts` ditambah fungsi `generateImage()` yang call `POST /google-flow/images`. Worker dipindah dari LLM `generateImage` ke useapi `generateImage`. Type `embedding` dan `text2img` dihapus dari `LayerName`.

**Tech Stack:** TypeScript, Next.js, OpenRouter, useapi.net Google Flow

---

## File Map

| File | Aksi | Tanggung jawab |
|------|------|----------------|
| `app/lib/llm/client.ts` | Rewrite | OpenRouter HTTP client, hapus image+embedding endpoints |
| `app/lib/llm/types.ts` | Modify | Hapus `embedding`, `text2img` dari LayerName, hapus interface tidak dipakai |
| `app/lib/llm/registry.ts` | Rewrite | Model registry OpenRouter format, presets baru |
| `app/lib/llm/index.ts` | Modify | Hapus `generateImage`, `embedBatch`, `embedSingle`, `getModelDim` |
| `app/lib/useapi.ts` | Modify | Tambah `generateImage()` function untuk Google Flow Imagen |
| `worker/runGeneration.ts` | Modify | Switch ke `generateImage` useapi, aspect ratio dynamic |
| `app/studio/components/EnginePicker.tsx` | Modify | Update model options, default aspect ratio = portrait |

---

## Task 1: Rewrite client.ts ke OpenRouter

**Files:**
- Modify: `app/lib/llm/client.ts`

- [ ] **Step 1: Replace BASE_URL dan API key logic**

Di `app/lib/llm/client.ts`, ganti baris 4 dan fungsi `apiKey()`:

```ts
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
```

- [ ] **Step 2: Update headers dengan OpenRouter-specific fields**

Ganti fungsi `headers()`:

```ts
function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.OPENROUTER_REFERER ?? 'https://ideamills.app',
    'X-Title': 'IdeaMills',
  };
}
```

- [ ] **Step 3: Hapus image generation interfaces dan function**

Hapus dari `client.ts`:
- Interface `ImageGenerationRequest` dan `ImageGenerationResponse`
- Fungsi `imageGeneration` di akhir file

- [ ] **Step 4: Hapus embedding interfaces dan function**

Hapus dari `client.ts`:
- Interface `EmbeddingRequest` dan `EmbeddingResponse`
- Fungsi `embeddings` di akhir file

- [ ] **Step 5: Update error messages dari LLMGateway → OpenRouter**

Di fungsi `request()`, ganti baris 117–146 dengan:

```ts
    if (!res.ok) {
      const text = await res.text();
      const code =
        res.status === 429 ? 'RATE_LIMIT' : res.status >= 500 ? 'PROVIDER_ERROR' : 'INVALID_RESPONSE';
      const friendlyMsg =
        res.status === 402
          ? `OpenRouter 402: Saldo tidak cukup. Top up di openrouter.ai/credits.`
          : `OpenRouter ${res.status}: ${text.slice(0, 500)}`;
      throw new LLMError(
        friendlyMsg,
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
```

- [ ] **Step 6: Update ChatCompletionResponse usage field**

Di interface `ChatCompletionResponse` (baris 51–56), ganti `total_cost?: number` jadi:

```ts
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;  // OpenRouter native field name
    total_cost?: number;  // legacy compat
  };
```

- [ ] **Step 7: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "client.ts"
```
Expected: tidak ada error baru di `client.ts`. Mungkin ada error di file lain yang masih reference `imageGeneration`/`embeddings` — itu akan diperbaiki di Task berikutnya.

---

## Task 2: Update types.ts — hapus embedding, text2img

**Files:**
- Modify: `app/lib/llm/types.ts`

- [ ] **Step 1: Hapus `embedding` dan `text2img` dari LayerName**

Ganti baris 1–9:

```ts
export type LayerName =
  | 'vision'
  | 'ideation'
  | 'scripting'
  | 'visualPrompt'
  | 'ideas'
  | 'expand';
```

- [ ] **Step 2: Hapus `embedding` dan `text2img` dari ModelConfig**

Ganti interface `ModelConfig` (baris 13–23):

```ts
export interface ModelConfig {
  preset: PresetName;
  vision: string;
  ideation: string;
  scripting: string;
  visualPrompt: string;
  ideas: string;
  expand: string;
}
```

- [ ] **Step 3: Hapus interface yang tidak dipakai**

Hapus dari `types.ts`:
- Interface `EmbeddingResponse` (baris 56–61)
- Interface `ImageResponse` (baris 63–67)
- Interface `ImageCallOptions` (baris 69–73)

- [ ] **Step 4: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "types.ts"
```
Expected: tidak ada error baru di `types.ts`.

---

## Task 3: Rewrite registry.ts dengan format OpenRouter

**Files:**
- Modify: `app/lib/llm/registry.ts`

- [ ] **Step 1: Replace seluruh isi registry.ts**

Ganti seluruh file dengan:

```ts
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
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
  ],

  ideation: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
  ],

  scripting: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
  ],

  visualPrompt: [
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
    { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2', tier: 'budget' },
  ],

  ideas: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'z-ai/glm-4.6:free', label: 'GLM 4.6 (free)', tier: 'budget', note: 'Free tier — rate-limited' },
    { id: 'x-ai/grok-4', label: 'Grok 4', tier: 'balanced' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', tier: 'premium' },
    { id: 'openai/gpt-5', label: 'GPT-5', tier: 'premium' },
  ],

  expand: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'z-ai/glm-4.6:free', label: 'GLM 4.6 (free)', tier: 'budget', note: 'Free tier — rate-limited' },
    { id: 'x-ai/grok-4', label: 'Grok 4', tier: 'balanced' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', tier: 'premium' },
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
    expand: 'google/gemini-2.5-flash',
  },
  balanced: {
    vision: 'google/gemini-2.5-pro',
    ideation: 'google/gemini-2.5-flash',
    scripting: 'google/gemini-2.5-flash',
    visualPrompt: 'anthropic/claude-sonnet-4.5',
    ideas: 'google/gemini-2.5-flash',
    expand: 'deepseek/deepseek-v3.2-exp',
  },
  premium: {
    vision: 'anthropic/claude-sonnet-4.5',
    ideation: 'google/gemini-2.5-pro',
    scripting: 'google/gemini-2.5-pro',
    visualPrompt: 'anthropic/claude-sonnet-4.5',
    ideas: 'anthropic/claude-sonnet-4.5',
    expand: 'anthropic/claude-sonnet-4.5',
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
```

- [ ] **Step 2: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "registry.ts"
```
Expected: tidak ada error.

---

## Task 4: Update index.ts — hapus image+embedding helpers

**Files:**
- Modify: `app/lib/llm/index.ts`

- [ ] **Step 1: Update imports**

Ganti baris 1–28:

```ts
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
```

- [ ] **Step 2: Hapus fungsi `getModelDim`**

Hapus baris yang dulunya:
```ts
import { getModelEntry } from './registry';
function getModelDim(modelId: string): number {
  const entry = getModelEntry('embedding', modelId);
  return entry?.dim ?? 1536;
}
```
(sudah hilang dari Step 1 imports)

- [ ] **Step 3: Hapus fungsi `embedBatch` dan `embedSingle`**

Hapus dari `index.ts` (baris 91–134 di file lama):
- `export async function embedBatch(...)`
- `export async function embedSingle(...)`

- [ ] **Step 4: Hapus fungsi `generateImage`**

Hapus dari `index.ts` (baris 136–216 di file lama):
- Const `IMAGES_API_MODELS`
- `export async function generateImage(...)`

- [ ] **Step 5: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "lib/llm"
```
Expected: tidak ada error baru di `app/lib/llm/`.

---

## Task 5: Tambah generateImage di useapi.ts

**Files:**
- Modify: `app/lib/useapi.ts`

- [ ] **Step 1: Tambah interface dan fungsi generateImage**

Tambahkan di akhir `app/lib/useapi.ts` (sebelum fungsi `sleep`):

```ts
export interface ImageGenerateOptions {
  prompt: string;
  model?: 'imagen-4' | 'nano-banana-2' | 'nano-banana-pro';
  aspectRatio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  count?: 1 | 2 | 3 | 4;
  email?: string;
}

export interface ImageGenerateResult {
  jobId: string;
  imageUrl: string;
  mediaGenerationId: string;
}

interface RawImageResponse {
  jobId: string;
  media?: Array<{
    image?: {
      generatedImage?: {
        mediaGenerationId?: string;
        fifeUrl?: string;
      };
    };
  }>;
}

/**
 * Generate image via useapi.net Google Flow.
 * Endpoint: POST /google-flow/images
 */
export async function generateImage(opts: ImageGenerateOptions): Promise<ImageGenerateResult> {
  const userEmail = opts.email ?? process.env.USEAPI_GOOGLE_EMAIL;
  if (!userEmail) throw new Error('USEAPI_GOOGLE_EMAIL not set');

  const result = await jsonRequest<RawImageResponse>(
    'POST',
    '/google-flow/images',
    {
      email: userEmail,
      prompt: opts.prompt,
      model: opts.model ?? 'imagen-4',
      aspectRatio: opts.aspectRatio ?? '16:9',
      count: opts.count ?? 1,
    }
  );

  const first = result.media?.[0]?.image?.generatedImage;
  const imageUrl = first?.fifeUrl;
  const mediaGenerationId = first?.mediaGenerationId;
  if (!imageUrl || !mediaGenerationId) {
    throw new Error('useapi.net image: missing fifeUrl/mediaGenerationId in response');
  }

  return {
    jobId: result.jobId,
    imageUrl,
    mediaGenerationId,
  };
}
```

- [ ] **Step 2: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "useapi.ts"
```
Expected: tidak ada error.

---

## Task 6: Update worker — switch ke useapi generateImage

**Files:**
- Modify: `worker/runGeneration.ts`

- [ ] **Step 1: Update imports**

Di `worker/runGeneration.ts` baris 1–6, ganti:

```ts
import { ObjectId } from 'mongodb';
import { getDb } from '../app/lib/mongoClient';
import { uploadImageAsset, createVideoJob, waitForVideo, generateImage as generateImageUseapi } from '../app/lib/useapi';
import { resolvePreset } from '../app/lib/llm';
import { saveImage, downloadAndSaveVideo, storagePathToUrl } from '../app/lib/storage';
import type { Clip, ClipImageMode } from '../app/lib/types';
```

(Hapus `generateImage` dari import LLM, tambah ke import useapi sebagai alias.)

- [ ] **Step 2: Update blok ai-generate untuk pakai useapi**

Di `worker/runGeneration.ts` baris 183–199, ganti:

```ts
  } else {
    // ai-generate: build image prompt with style notes + clip prompt
    const imagePrompt = styleNotes ? `${styleNotes}\n\n${clip.prompt}` : clip.prompt;
    const imgRes = await generateImage(
      imagePrompt,
      { aspectRatio: '16:9' },
      modelConfig as Parameters<typeof generateImage>[2],
      generationId
    );
    imageData = imgRes.images[0];
    const imageFilePath = await saveImage(imageData, generationId, `clip-${clip.index}.jpg`);
    const imagePublicUrl = storagePathToUrl(imageFilePath);
    await db.collection('Generations').updateOne(
      { _id: oid },
      { $set: { 'clips.$[c].generated_image_path': imagePublicUrl } },
      { arrayFilters }
    );
  }
```

Dengan:

```ts
  } else {
    // ai-generate: build image prompt with style notes + clip prompt
    const imagePrompt = styleNotes ? `${styleNotes}\n\n${clip.prompt}` : clip.prompt;
    const imgAspect = aspectRatio === 'portrait' ? '9:16' : '16:9';
    const imgRes = await generateImageUseapi({
      prompt: imagePrompt,
      aspectRatio: imgAspect,
      model: 'imagen-4',
    });

    // fifeUrl is a signed URL — download immediately and convert to base64 for downstream upload
    const fetched = await fetch(imgRes.imageUrl);
    if (!fetched.ok) {
      throw new Error(`Failed to download image from useapi (${fetched.status})`);
    }
    const imgBuffer = Buffer.from(await fetched.arrayBuffer());
    const imgBase64 = imgBuffer.toString('base64');
    imageData = `data:image/jpeg;base64,${imgBase64}`;

    const imageFilePath = await saveImage(imageData, generationId, `clip-${clip.index}.jpg`);
    const imagePublicUrl = storagePathToUrl(imageFilePath);
    await db.collection('Generations').updateOne(
      { _id: oid },
      { $set: { 'clips.$[c].generated_image_path': imagePublicUrl } },
      { arrayFilters }
    );
  }
```

- [ ] **Step 3: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "runGeneration"
```
Expected: tidak ada error baru.

---

## Task 7: Update EnginePicker — model options + default aspect ratio

**Files:**
- Modify: `app/studio/components/EnginePicker.tsx`

- [ ] **Step 1: Replace TEXT_MODEL_OPTIONS**

Ganti baris 6–21:

```tsx
// Model IDs follow OpenRouter format: provider/model
export const TEXT_MODEL_OPTIONS = [
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (cepat & murah) ⭐' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2 (murah)' },
  { id: 'z-ai/glm-4.6:free', label: 'GLM 4.6 (gratis, rate-limited)' },
  { id: 'x-ai/grok-4', label: 'Grok 4' },
  { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { id: 'openai/gpt-5', label: 'GPT-5' },
] as const;
```

- [ ] **Step 2: Update DEFAULT_TEXT_MODEL dan DEFAULT_ASPECT_RATIO**

Ganti baris 37–39:

```ts
export const DEFAULT_TEXT_MODEL: TextModelId = 'google/gemini-2.5-flash';
export const DEFAULT_VEO_MODEL: VeoModelId = 'veo-3.1-fast';
export const DEFAULT_ASPECT_RATIO: AspectRatio = 'portrait';
```

- [ ] **Step 3: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "EnginePicker"
```
Expected: tidak ada error.

---

## Task 8: End-to-end verification

**Files:** (no changes — verification only)

- [ ] **Step 1: Set OPENROUTER_API_KEY di environment**

Pastikan `.env.local` sudah punya:
```
OPENROUTER_API_KEY=sk-or-v1-...
USEAPI_TOKEN=...
USEAPI_GOOGLE_EMAIL=...
```

- [ ] **Step 2: Jalankan dev server**

```bash
npm run dev
```
Expected: server start tanpa error.

- [ ] **Step 3: Cek seluruh TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```
Expected: hanya error pre-existing (di `app/api/generations/route.ts`, `app/api/worker/health/route.ts`, dll yang tidak terkait migrasi). Tidak ada error baru di `lib/llm/`, `useapi.ts`, `runGeneration.ts`, `EnginePicker.tsx`.

- [ ] **Step 4: Test studio flow**

Buka `http://localhost:3000/studio`:
1. Upload foto product
2. Generate ide → pilih ide → ClipEditor muncul dengan 1 clip
3. Verifikasi clip prompt berbahasa Indonesia dengan VO dialog
4. Verifikasi default aspect ratio = portrait

- [ ] **Step 5: Test image generation (mode ai-generate)**

Di ClipEditor, set imageMode ke `ai-generate`, lalu Generate Video. Monitor worker log:
- `useapi.net /google-flow/images` request berhasil
- Image fifeUrl ter-download
- File `storage/images/<jobId>/clip-0.jpg` exists

---

## Self-Review Checklist

**Spec coverage:**
- [x] Section 1: HTTP Client → Task 1
- [x] Section 2: Model Registry → Task 3
- [x] Section 3: Image Generation pindah ke useapi → Tasks 5+6
- [x] Section 4: Default Aspect Ratio → Task 7
- [x] Section 5: Type Updates → Task 2
- [x] Section 6: Env Vars → Task 8 (verification)
- [x] Section 7: Documentation Update → DELIBERATELY DEFERRED (tidak ada di plan; bisa dikerjakan terpisah setelah migrasi berfungsi)

**Tidak ada placeholder** — semua step punya kode konkret.

**Type consistency:**
- `ImageGenerateOptions`, `ImageGenerateResult`: didefinisikan di Task 5, dipakai di Task 6 — konsisten
- `LayerName` di Task 2 hapus `embedding`/`text2img`; `MODEL_REGISTRY` di Task 3 hanya berisi 6 layer (vision, ideation, scripting, visualPrompt, ideas, expand) — match
- `ModelConfig` di Task 2 hanya 6 field — match dengan `PRESETS` di Task 3
- `generateImage` dari useapi di-import as alias `generateImageUseapi` di Task 6 — tidak konflik dengan apapun
