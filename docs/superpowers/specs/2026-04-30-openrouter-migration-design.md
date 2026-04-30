# Design: Full Migration LLMGateway → OpenRouter

**Date:** 2026-04-30
**Branch:** feature/studio-clean-flow

## Problem

LLM provider saat ini (LLMGateway) menyediakan model GLM gratis yang sangat sering 429 (rate limit), bahkan untuk request normal. Provider `zai` overloaded mengakibatkan vision call gagal di mode `fast`. User butuh provider yang lebih stabil dan flexible.

OpenRouter:
- Lebih stabil untuk model utama (Gemini, Claude, GPT)
- Format model ID standar `provider/model`
- Tidak support `/embeddings` dan `/images/generations` — keduanya harus pindah ke provider lain

## Solution: Full migration ke OpenRouter

Chat completions pindah ke OpenRouter. Image generation pindah ke useapi.net (Google Flow `POST /google-flow/images`). Embedding dihapus karena tidak dipakai.

---

## Section 1: HTTP Client Update

**File:** `app/lib/llm/client.ts`

Perubahan:
- `BASE_URL` dari `https://api.llmgateway.io/v1` → `https://openrouter.ai/api/v1`
- API key: hanya baca `OPENROUTER_API_KEY`, tidak ada fallback
- Tambah headers OpenRouter:
  - `HTTP-Referer: process.env.OPENROUTER_REFERER ?? 'https://ideamills.app'`
  - `X-Title: 'IdeaMills'`
- Hapus fungsi `imageGeneration` (pindah ke useapi)
- Hapus fungsi `embeddings` (tidak dipakai)
- Hapus interface `ImageGenerationRequest`, `ImageGenerationResponse`, `EmbeddingRequest`, `EmbeddingResponse`
- Update error message: `LLMGateway` → `OpenRouter` di semua throw
- Hilangkan special case 402 message untuk LLMGateway

OpenRouter chat completions response shape sama dengan OpenAI/LLMGateway. `usage.total_cost` diganti `usage.cost`.

---

## Section 2: Model Registry Rewrite

**File:** `app/lib/llm/registry.ts`

Format model ID baru: `provider/model`. Mapping:

| Layer | OpenRouter Model IDs |
|-------|---------------------|
| `vision` | `google/gemini-2.5-flash`, `google/gemini-2.5-pro`, `anthropic/claude-sonnet-4.5`, `openai/gpt-5` |
| `ideas` | `google/gemini-2.5-flash`, `google/gemini-2.5-pro`, `anthropic/claude-sonnet-4.5`, `deepseek/deepseek-v3.2-exp`, `x-ai/grok-4`, `openai/gpt-5`, `z-ai/glm-4.6:free` |
| `expand` | sama dengan `ideas` |
| `ideation` | (alias lama) sama dengan `ideas` |
| `scripting` | sama dengan `ideas` |
| `visualPrompt` | `anthropic/claude-sonnet-4.5`, `openai/gpt-5`, `deepseek/deepseek-v3.2-exp` |

**Layer yang dihapus:**
- `embedding` — tidak dipakai
- `text2img` — pindah ke useapi

**Preset baru:**

```ts
fast: {
  vision: 'google/gemini-2.5-flash',
  ideation: 'google/gemini-2.5-flash',
  scripting: 'google/gemini-2.5-flash',
  visualPrompt: 'google/gemini-2.5-flash',
  ideas: 'google/gemini-2.5-flash',
  expand: 'google/gemini-2.5-flash',
}
balanced: {
  vision: 'google/gemini-2.5-pro',
  ideation: 'google/gemini-2.5-flash',
  scripting: 'google/gemini-2.5-flash',
  visualPrompt: 'anthropic/claude-sonnet-4.5',
  ideas: 'google/gemini-2.5-flash',
  expand: 'deepseek/deepseek-v3.2-exp',
}
premium: {
  vision: 'anthropic/claude-sonnet-4.5',
  ideation: 'google/gemini-2.5-pro',
  scripting: 'google/gemini-2.5-pro',
  visualPrompt: 'anthropic/claude-sonnet-4.5',
  ideas: 'anthropic/claude-sonnet-4.5',
  expand: 'anthropic/claude-sonnet-4.5',
}
```

`DEFAULT_PRESET = 'fast'` tetap.

---

## Section 3: Image Generation Pindah ke useapi

**File:** `app/lib/useapi.ts`

Tambahkan fungsi baru:

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
  imageUrl: string;          // fifeUrl, signed URL
  mediaGenerationId: string;
}

export async function generateImage(opts: ImageGenerateOptions): Promise<ImageGenerateResult>
```

**Default:** `model: 'imagen-4'`, `count: 1`. Aspect ratio diberikan caller (worker).

Endpoint: `POST https://api.useapi.net/v1/google-flow/images`

Response parsing:
- Ambil `media[0].image.generatedImage.fifeUrl` → `imageUrl`
- Ambil `media[0].image.generatedImage.mediaGenerationId` → `mediaGenerationId`
- Ambil top-level `jobId`

**File:** `worker/runGeneration.ts`

Update di blok `mode === 'ai-generate'`:

```ts
// Sebelum
const imgRes = await generateImage(
  imagePrompt,
  { aspectRatio: '16:9' },
  modelConfig as Parameters<typeof generateImage>[2],
  generationId
);
imageData = imgRes.images[0];

// Sesudah
const imgAspect = aspectRatio === 'portrait' ? '9:16' : '16:9';
const imgRes = await generateImageUseapi({
  prompt: imagePrompt,
  aspectRatio: imgAspect,
  model: 'imagen-4',
});
imageData = imgRes.imageUrl;
```

Karena `imageUrl` adalah signed URL (fifeUrl), perlu di-fetch dan convert ke base64 atau langsung di-pass ke `saveImage` (yang akan download via URL).

**File:** `app/lib/llm/index.ts`

Hapus:
- Fungsi `generateImage`
- Fungsi `embedBatch`, `embedSingle`
- Fungsi `getModelDim`
- Import `imageGeneration`, `embeddings` dari `./client`
- Const `IMAGES_API_MODELS`
- Type imports `ImageCallOptions`, `ImageResponse` jika tidak dipakai lagi

---

## Section 4: Default Aspect Ratio

**File:** `app/studio/components/EnginePicker.tsx`

```ts
// Sebelum
export const DEFAULT_ASPECT_RATIO: AspectRatio = 'landscape';

// Sesudah
export const DEFAULT_ASPECT_RATIO: AspectRatio = 'portrait';
```

Alasan: target user adalah ads Instagram Reels + TikTok, keduanya 9:16.

EnginePicker `TEXT_MODEL_OPTIONS` juga akan di-update untuk pakai format OpenRouter dengan label yang clear. Default `DEFAULT_TEXT_MODEL = 'google/gemini-2.5-flash'` (ganti dari `glm-4.7-flash`).

---

## Section 5: Type Updates

**File:** `app/lib/llm/types.ts`

Hapus dari `LayerName`:
- `embedding`
- `text2img`

Hapus dari `ModelConfig`:
- `embedding: string`
- `text2img: string`

Hapus interface `EmbeddingResponse` (tidak dipakai).
Hapus interface `ImageResponse`, `ImageCallOptions` (tidak dipakai setelah `generateImage` LLM dihapus).

---

## Section 6: Environment Variables

**File:** `.env` (user manage manual)

Tambahkan:
```
OPENROUTER_API_KEY=...
OPENROUTER_REFERER=https://ideamills.app  # optional
```

`LLM_GATEWAY_API_KEY` tidak dipakai lagi tapi tidak perlu dihapus dari `.env` user.

**File:** `scripts/setup-env.ts`, `scripts/validate-env.ts`

Cek apakah scripts ini reference `LLM_GATEWAY_API_KEY`. Jika ya, ganti ke `OPENROUTER_API_KEY`.

---

## Section 7: Documentation Update

**File:** `docs/setup.md`, `docs/tech-spec.md`, `docs/architecture.md`

Update referensi:
- `LLMGateway` / `llmgateway.io` → `OpenRouter` / `openrouter.ai`
- Model IDs di tabel
- Endpoint `/v1/chat/completions` di OpenRouter

---

## Out of Scope

- Embedding restoration — kalau nanti butuh, pakai OpenAI atau Cohere langsung (bukan OpenRouter)
- Model selector image generation di EnginePicker — pakai default `imagen-4` saja
- Image generation fallback retry — kalau useapi error, langsung throw
- Cost tracking di OpenRouter — `usage.cost` di-log saja, tidak ada tracking dashboard

## Risks

1. **Model ID tidak tersedia di OpenRouter** — beberapa model di mapping di atas perlu verifikasi via `https://openrouter.ai/api/v1/models`. Mitigasi: kalau model tidak ada, fallback ke yang setara (Gemini Flash universal).

2. **fifeUrl expire cepat** — signed URL dari useapi mungkin punya TTL pendek. Mitigasi: `saveImage` di worker langsung download dan simpan ke storage lokal sebelum URL expire.

3. **OpenRouter `usage.cost` field** — perlu verifikasi nama field exact di response. Mitigasi: log raw response sekali untuk verifikasi sebelum production.
