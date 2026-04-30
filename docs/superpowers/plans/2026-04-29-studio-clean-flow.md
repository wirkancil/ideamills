# Studio Clean Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan chunk-by-chunk. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor IdeaMills "Dari Nol" pipeline jadi 3-step flow (Input → Pilih Ide → Edit Clips & Generate) dengan single-text per clip, drop Hook/Problem/Solution/CTA splitting.

**Architecture (Opsi C — Parallel Namespace + Atomic Cleanup):**
1. Build v2 di parallel namespace (`app/studio-v2/`, new files only) — kode lama tidak di-edit
2. Test v2 standalone end-to-end di `/studio-v2`
3. Atomic swap: rename `studio-v2` → `studio`, delete semua deadcode/deadfile sekaligus, drop legacy MongoDB collections
4. Manual test final + PR

Pendekatan ini menghindari periode mid-refactor yang broken karena old + new co-exist sampai swap commit. Cleanup deadcode di Chunk 8 dilakukan dalam 1 atomic commit.

**Tech Stack:** Next.js 14 App Router, TypeScript, MongoDB native driver, OpenRouter (LLM gateway), useapi.net (Veo), shadcn/ui primitives, Zod validation. No test framework (manual test plan).

**Spec:** [`docs/superpowers/specs/2026-04-29-studio-clean-flow-design.md`](../specs/2026-04-29-studio-clean-flow-design.md)

---

## Reusable from Existing Codebase (DO NOT modify in chunks 1-7)

```
app/lib/llm/                          # OpenRouter middleware infrastructure
app/lib/useapi.ts                     # Veo client
app/lib/storage.ts                    # saveImage, downloadAndSaveVideo, storagePathToUrl
app/lib/mongoClient.ts                # getDb, ensureIndexes
app/lib/queue.ts                      # enqueueJob, dequeueJob
app/lib/utils.ts                      # generateIdempotencyKey
app/lib/workerConfig.ts               # MAX_QUEUE_DEPTH (other constants will be removed in Chunk 8)
app/components/ui/                    # shadcn primitives
app/components/TopBar.tsx
app/components/GenerationHistory.tsx  # will get legacy badge in Chunk 6
app/api/storage/[...path]/route.ts    # serves /storage/* files
app/api/queue/                        # if exists, queue management
app/api/worker/                       # if exists, worker control
app/scripts/                          # Script Bank (separate feature, untouched)
app/history/page.tsx
app/assets/page.tsx                   # if exists
app/api/generations/[id]/route.ts     # extended in Chunk 2 (additive)
worker/runGeneration.ts               # entry point, gets v2 branch in Chunk 3 (additive)
```

## Deadcode/Deadfile Catalog (DELETE in Chunk 8)

```
# API routes lama
app/api/analyze-images/                       # entire dir
app/api/generate-creative-ideas/              # entire dir
app/api/generate-enhanced/                    # entire dir
app/api/generate-directors-script/            # entire dir

# Components lama
app/components/ResultsDisplay.tsx             # 656 lines
app/components/SceneAssetPanel.tsx            # 542 lines
app/components/InputForm.tsx                  # orphan dead code
app/components/JobStatus.tsx                  # if not used by new detail page

# LLM v1 functions di app/lib/llm/index.ts
- ideation50()
- script5()
- enrichVisualPrompts()
- visionDescribeProduct()       # replaced by visionCombined
- visionDescribeModel()          # replaced by visionCombined
- genericModelDescribe()         # not used in v2

# LLM v1 prompts di app/lib/llm/prompts.ts
- IDEATION_SYSTEM, IDEATION_USER
- SCRIPTING_SYSTEM, SCRIPTING_USER
- VISUAL_PROMPT_SYSTEM, VISUAL_PROMPT_USER
- VISION_PRODUCT_PROMPT, VISION_MODEL_PROMPT
- GENERIC_MODEL_PROMPT

# Layer names + registry entries di app/lib/llm/types.ts + registry.ts
- 'embedding' (no v2 usage)
- 'scripting' (no v2 usage)
- 'visualPrompt' (no v2 usage)
# Keep: vision, ideation, text2img, ideas, expand

# workerConfig.ts constants tidak dipakai v2
- IDEATION_POOL_SIZE
- UNIQUE_THEME_TARGET
- SIMILARITY_THRESHOLD
- SCRIPTS_PER_THEME
- VISUAL_PROMPT_CHUNK
- SCENE_CHUNK_SIZE
- STANDARD_CONCURRENCY (replaced by hardcoded 2 in worker)
- STRUCTURED_CONCURRENCY (no longer needed)

# types.ts entries tidak dipakai v2
- SceneType
- Scene
- Variation
- GenerationResponse
- GenerationRequest
- EnhancedGenerationRequest
- GenerationJobPayload
- JobType  # if v2 only has 1 type
- DBScript
- DBScene
- SceneAssetState

# queue.ts simplification
- detectJobType() — only 1 type now
- jobType filter logic in dequeueJob

# Worker v1 logic in runGeneration.ts (everything after v2 branch)

# MongoDB collections (drop via migration script)
- Scripts
- Scenes

# Studio v2 transitional folder (after swap)
- app/studio-v2/ — renamed to app/studio/ in Chunk 8
```

---

## Chunk 0 — Pre-flight Setup

- [ ] **Step 1: Create feature branch**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills
git checkout main
git pull origin main 2>/dev/null || true
git checkout -b feature/studio-clean-flow
```

- [ ] **Step 2: Verify baseline build passes**

```bash
npm run build
```
Expected: No TypeScript errors. Note any pre-existing errors — we won't fix them, just track they're pre-existing.

- [ ] **Step 3: Backup MongoDB**

```bash
mongodump --uri="$MONGODB_URI" --out="./backup-$(date +%Y%m%d-%H%M%S)"
```
Expected: Backup folder created with all collections.

- [ ] **Step 4: Verify env vars present**

```bash
node -e "console.log({
  openrouter: !!process.env.OPENROUTER_API_KEY,
  useapi: !!process.env.USEAPI_TOKEN,
  email: !!process.env.USEAPI_GOOGLE_EMAIL,
  mongo: !!process.env.MONGODB_URI,
  storage: !!process.env.STORAGE_PATH,
})"
```
Expected: All `true`.

- [ ] **Step 5: Initial commit**

```bash
git add -A
git commit --allow-empty -m "chore: start studio-clean-flow refactor (Opsi C parallel namespace)"
```

---

## Chunk 1 — LLM Foundation (Additive Only)

**Goal:** Add new types, prompts, functions, registry entries. **Do not modify or delete existing v1 code.** All additions co-exist with v1.

### 1.1 Add Types

- [ ] **Step 1: Append v2 types to `app/lib/types.ts`**

At end of `app/lib/types.ts`, append:

```ts
// ============================================================
// V2 Studio Clean Flow types
// ============================================================

export interface Idea {
  title: string;       // 1-120 char
  content: string;     // 20-800 char, single paragraph naratif
}

export type ClipImageMode = 'inherit' | 'override' | 'ai-generate';

export interface Clip {
  index: number;                         // 0-5
  prompt: string;                        // 10-2000 char unified prompt
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;          // wajib jika imageMode === 'override'
  generated_image_path?: string | null;
  generated_video_path?: string | null;
  image_status: AssetStatus;
  video_status: AssetStatus;
  image_error?: string | null;
  video_error?: string | null;
  media_generation_id?: string | null;
  video_job_id?: string | null;
  created_at: Date;
  updated_at?: Date;
}
```

### 1.2 Update DBGeneration to Support Both v1 & v2

- [ ] **Step 1: Replace `DBGeneration` interface with extended version**

In `app/lib/types.ts`, find `DBGeneration` interface and replace with:

```ts
export interface DBGeneration {
  _id: string;
  idempotency_key?: string;

  // Format marker — undefined for v2 (default), 'legacy' for v1 docs
  format_version?: 'legacy';

  // Input
  product_image_url?: string;
  model_image_url?: string | null;
  brief?: string;                      // v2 field

  // Vision result (v2 — stored for use in expand step)
  productAnalysis?: ProductDescription;
  modelAnalysis?: ModelDescription | null;

  // Ideas (v2)
  ideas?: Idea[];
  selectedIdeaIndex?: number;

  // Expanded clips (v2)
  styleNotes?: string;
  clips?: Clip[];

  // Display identifiers
  product_identifier: string;
  creative_idea_title?: string;

  // Legacy field (v1)
  overrides?: string | null;

  // Status
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed' | 'canceled';
  progress: number;
  progress_label?: string;
  error_message?: string | null;

  modelConfig?: Record<string, unknown>;

  created_at: Date;
  updated_at: Date;
}
```

### 1.3 Add LLM Layer Names

- [ ] **Step 1: Update `LayerName` and `ModelConfig` in `app/lib/llm/types.ts`**

Replace the existing `LayerName` and `ModelConfig` declarations with:

```ts
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
```

### 1.4 Update Registry

- [ ] **Step 1: Add new layer entries in `MODEL_REGISTRY`**

In `app/lib/llm/registry.ts`, inside `MODEL_REGISTRY`, after `text2img` entry, add:

```ts
  ideas: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
  ],
  expand: [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'budget' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'balanced' },
    { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', tier: 'budget' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tier: 'premium' },
  ],
```

- [ ] **Step 2: Update `PRESETS` to include new layers**

Replace entire `PRESETS` constant with:

```ts
export const PRESETS: Record<Exclude<PresetName, 'custom'>, Omit<ModelConfig, 'preset'>> = {
  fast: {
    vision: 'google/gemini-2.5-flash',
    ideation: 'google/gemini-2.5-flash',
    embedding: 'openai/text-embedding-3-small',
    scripting: 'google/gemini-2.5-flash',
    visualPrompt: 'deepseek/deepseek-v3.2',
    text2img: 'google/gemini-2.5-flash-image',
    ideas: 'google/gemini-2.5-flash',
    expand: 'google/gemini-2.5-flash',
  },
  balanced: {
    vision: 'google/gemini-2.5-pro',
    ideation: 'google/gemini-2.5-flash',
    embedding: 'openai/text-embedding-3-small',
    scripting: 'google/gemini-2.5-flash',
    visualPrompt: 'anthropic/claude-sonnet-4.6',
    text2img: 'google/gemini-2.5-flash-image',
    ideas: 'google/gemini-2.5-flash',
    expand: 'deepseek/deepseek-v3.2',
  },
  premium: {
    vision: 'anthropic/claude-sonnet-4.6',
    ideation: 'google/gemini-2.5-pro',
    embedding: 'openai/text-embedding-3-large',
    scripting: 'google/gemini-2.5-pro',
    visualPrompt: 'anthropic/claude-sonnet-4.6',
    text2img: 'google/gemini-3.1-flash-image-preview',
    ideas: 'anthropic/claude-sonnet-4.6',
    expand: 'anthropic/claude-sonnet-4.6',
  },
};
```

### 1.5 Add v2 Prompts

- [ ] **Step 1: Append new prompts to `app/lib/llm/prompts.ts`**

At end of file, append:

```ts
// ============================================================
// V2 PROMPTS — Studio Clean Flow
// ============================================================

export const VISION_COMBINED_PROMPT = (brief: string) => `Kamu adalah analis visual untuk advertising. Analisis foto produk dan foto model (jika ada) untuk konteks ide iklan video Indonesia.

Brief user: "${brief || '(kosong)'}"

Return JSON dengan struktur:
{
  "productAnalysis": {
    "brand": "...",
    "category": "...",
    "form_factor": "...",
    "color_scheme": "...",
    "key_benefit": "...",
    "target_audience": "...",
    "style": "...",
    "notable_text": "..."
  },
  "modelAnalysis": {
    "age_range": "...",
    "gender": "...",
    "ethnicity": "...",
    "appearance": "...",
    "style": "..."
  } | null
}

Jika foto model tidak ada (akan dikasih tau di pesan), set modelAnalysis berdasarkan target audience produk sebagai persona suggestion (gender/usia/style yang fit).

Akurat dan detail. Bahasa Indonesia untuk field naratif (style, appearance), Inggris boleh untuk technical terms (form_factor, etc).`;

export const IDEAS_SYSTEM = `Kamu adalah Senior Creative Strategist untuk iklan video viral Indonesia. Generate ide iklan yang relevan, kreatif, dan match dengan target audience.`;

export const IDEAS_USER = (productAnalysis: unknown, modelAnalysis: unknown, brief: string) => `PRODUK: ${JSON.stringify(productAnalysis)}
MODEL: ${JSON.stringify(modelAnalysis)}
BRIEF: "${brief || '(tidak ada)'}"

Generate 3-5 ide iklan video 30 detik untuk produk ini. Setiap ide harus:
- title: singkat menarik (max 60 char)
- content: 1 paragraf naratif (60-200 kata) yang sudah include:
  * Konteks visual (model, setting, vibe)
  * Storyline ringkas (apa yang terjadi di video)
  * Tone & mood
  * Why it works untuk target audience

Return JSON: { "ideas": [{ "title": "...", "content": "..." }] }`;

export const EXPAND_SYSTEM = `Kamu adalah video director yang men-design 30-second commercial sebagai 4 clips × 8 detik dengan narrative flow.`;

export const EXPAND_USER = (
  productAnalysis: unknown,
  modelAnalysis: unknown,
  selectedIdea: { title: string; content: string },
  brief: string
) => `PRODUK: ${JSON.stringify(productAnalysis)}
MODEL: ${JSON.stringify(modelAnalysis)}
IDE TERPILIH:
  Title: "${selectedIdea.title}"
  Content: ${selectedIdea.content}
BRIEF: "${brief || '(tidak ada)'}"

Tugas:

1. Tulis "styleNotes" — 1 paragraf yang summarize visual identity:
   - Produk (3-5 anchor keywords spesifik agar Veo render konsisten)
   - Model appearance (umur, gender, style)
   - Location/setting umum
   - Lighting/tone/mood
   StyleNotes ini akan di-prepend ke setiap clip prompt untuk konsistensi visual antar clip.

2. Design 4 clips × 8 detik dengan narrative flow:
   - Clip 1: hook/intro (capture attention, introduce model+produk)
   - Clip 2: build/desire (show problem atau aspiration)
   - Clip 3: action/solution (model interact dengan produk)
   - Clip 4: resolution/CTA (transformation result + call-to-action)

   Setiap clip prompt harus:
   - Self-contained: full visual description (jangan tulis "as before"/"continuing from")
   - Single unified prompt: include camera angle, framing, lighting, model action, product placement, mood — semua dalam 1 paragraf
   - Reference produk dan model konsisten dengan styleNotes
   - 80-200 kata
   - Bahasa Indonesia untuk dialog/voiceover (jika ada), Inggris untuk technical visual terms

Return JSON:
{
  "styleNotes": "...",
  "clips": [
    { "prompt": "..." },
    { "prompt": "..." },
    { "prompt": "..." },
    { "prompt": "..." }
  ]
}`;
```

### 1.6 Add v2 LLM Functions

- [ ] **Step 1: Update imports at top of `app/lib/llm/index.ts`**

Replace the existing prompts import with:

```ts
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
  VISION_COMBINED_PROMPT,
  IDEAS_SYSTEM,
  IDEAS_USER,
  EXPAND_SYSTEM,
  EXPAND_USER,
} from './prompts';
```

Add type import (after existing type imports):

```ts
import type { Idea } from '../types';
```

- [ ] **Step 2: Append v2 functions at end of `app/lib/llm/index.ts`**

```ts
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
```

### 1.7 Add MongoDB Index

- [ ] **Step 1: Find `ensureIndexes` in `app/lib/mongoClient.ts`**

```bash
grep -n "ensureIndexes\|createIndex" app/lib/mongoClient.ts
```

- [ ] **Step 2: Add `format_version` index inside `ensureIndexes()`**

If not already present, add:

```ts
  await db.collection('Generations').createIndex({ format_version: 1 });
```

### 1.8 Verify & Commit Chunk 1

- [ ] **Step 1: Build check**

```bash
npm run build
```
Expected: Build pass with no errors. v1 code still works because we only added.

- [ ] **Step 2: Commit**

```bash
git add app/lib/types.ts app/lib/llm/types.ts app/lib/llm/registry.ts app/lib/llm/prompts.ts app/lib/llm/index.ts app/lib/mongoClient.ts
git commit -m "feat(llm): add v2 types, prompts, functions (visionCombined, ideateFromImages, expandToClips)"
```

---

## Chunk 2 — API Routes v2

**Goal:** Create 4 new endpoints under `/api/studio/`. Extend existing `/api/generations/[id]` to support v2 + legacy formats. **Do not delete old endpoints yet.**

### 2.1 POST /api/studio/ideas

- [ ] **Step 1: Create file**

```bash
mkdir -p app/api/studio/ideas
touch app/api/studio/ideas/route.ts
```

- [ ] **Step 2: Write implementation**

Write to `app/api/studio/ideas/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { resolvePreset, visionCombined, ideateFromImages } from '@/app/lib/llm';
import { generateIdempotencyKey } from '@/app/lib/utils';

const PRESET_NAMES = ['fast', 'balanced', 'premium', 'custom'] as const;

const RequestSchema = z.object({
  generationId: z.string().optional(),
  productImageUrl: z.string().min(1),
  modelImageUrl: z.string().nullable().optional(),
  brief: z.string().max(500).optional().default(''),
  preset: z.enum(PRESET_NAMES).optional().default('balanced'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.format() }, { status: 400 });
    }

    const { generationId, productImageUrl, modelImageUrl, brief, preset } = parsed.data;
    const modelConfig = resolvePreset(preset);

    const visionResult = await visionCombined(productImageUrl, modelImageUrl ?? null, brief, modelConfig);
    const ideas = await ideateFromImages(
      visionResult.productAnalysis,
      visionResult.modelAnalysis,
      brief,
      modelConfig
    );

    const db = await getDb();
    const now = new Date();
    let id: string;

    if (generationId) {
      const updateResult = await db.collection('Generations').updateOne(
        { _id: new ObjectId(generationId) },
        {
          $set: {
            productAnalysis: visionResult.productAnalysis,
            modelAnalysis: visionResult.modelAnalysis,
            ideas,
            selectedIdeaIndex: null,
            styleNotes: null,
            clips: [],
            status: 'queued',
            progress: 0,
            progress_label: 'Ide regenerated',
            updated_at: now,
          },
        }
      );
      if (updateResult.matchedCount === 0) {
        return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
      }
      id = generationId;
    } else {
      const idempotencyKey = generateIdempotencyKey({
        productImageUrl,
        modelImageUrl,
        brief,
        ts: now.getTime(),
      });
      const insertResult = await db.collection('Generations').insertOne({
        idempotency_key: idempotencyKey,
        product_image_url: productImageUrl,
        model_image_url: modelImageUrl ?? null,
        brief,
        productAnalysis: visionResult.productAnalysis,
        modelAnalysis: visionResult.modelAnalysis,
        ideas,
        product_identifier: visionResult.productAnalysis.brand ?? 'Unknown',
        status: 'queued',
        progress: 0,
        progress_label: 'Ide siap',
        modelConfig,
        created_at: now,
        updated_at: now,
      });
      id = insertResult.insertedId.toString();
    }

    return NextResponse.json({
      generationId: id,
      productAnalysis: visionResult.productAnalysis,
      modelAnalysis: visionResult.modelAnalysis,
      ideas,
    });
  } catch (error) {
    console.error('/api/studio/ideas error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2.2 POST /api/studio/expand

- [ ] **Step 1: Create file**

```bash
mkdir -p app/api/studio/expand
touch app/api/studio/expand/route.ts
```

- [ ] **Step 2: Write implementation**

Write to `app/api/studio/expand/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { resolvePreset, expandToClips } from '@/app/lib/llm';
import type { Clip, Idea } from '@/app/lib/types';

const RequestSchema = z.object({
  generationId: z.string().min(1),
  selectedIdeaIndex: z.number().int().min(0),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.format() }, { status: 400 });
    }

    const { generationId, selectedIdeaIndex } = parsed.data;
    const db = await getDb();

    const generation = await db.collection('Generations').findOne({ _id: new ObjectId(generationId) });
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    const ideas = (generation.ideas ?? []) as Idea[];
    if (selectedIdeaIndex >= ideas.length) {
      return NextResponse.json({ error: 'selectedIdeaIndex out of range' }, { status: 400 });
    }

    const selectedIdea = ideas[selectedIdeaIndex];
    const productAnalysis = generation.productAnalysis;
    const modelAnalysis = generation.modelAnalysis ?? null;
    const brief = generation.brief ?? '';
    const modelConfig = (generation.modelConfig ?? resolvePreset('balanced')) as ReturnType<typeof resolvePreset>;

    if (!productAnalysis) {
      return NextResponse.json({ error: 'Generation missing productAnalysis (run /ideas first)' }, { status: 400 });
    }

    const result = await expandToClips(productAnalysis, modelAnalysis, selectedIdea, brief, modelConfig);

    const now = new Date();
    const clips: Clip[] = result.clips.map((c, idx) => ({
      index: idx,
      prompt: c.prompt,
      imageMode: 'inherit',
      imageDataUrl: null,
      generated_image_path: null,
      generated_video_path: null,
      image_status: 'pending',
      video_status: 'pending',
      image_error: null,
      video_error: null,
      media_generation_id: null,
      video_job_id: null,
      created_at: now,
    }));

    await db.collection('Generations').updateOne(
      { _id: new ObjectId(generationId) },
      {
        $set: {
          selectedIdeaIndex,
          creative_idea_title: selectedIdea.title,
          styleNotes: result.styleNotes,
          clips,
          updated_at: now,
        },
      }
    );

    return NextResponse.json({
      styleNotes: result.styleNotes,
      clips: clips.map((c) => ({ index: c.index, prompt: c.prompt, imageMode: c.imageMode })),
    });
  } catch (error) {
    console.error('/api/studio/expand error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2.3 POST /api/studio/generate

- [ ] **Step 1: Create file**

```bash
mkdir -p app/api/studio/generate
touch app/api/studio/generate/route.ts
```

- [ ] **Step 2: Write implementation**

Write to `app/api/studio/generate/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { enqueueJob } from '@/app/lib/queue';
import { MAX_QUEUE_DEPTH } from '@/app/lib/workerConfig';
import type { Clip } from '@/app/lib/types';

const ClipDraftSchema = z.object({
  index: z.number().int().min(0).max(5),
  prompt: z.string().min(10).max(2000),
  imageMode: z.enum(['inherit', 'override', 'ai-generate']),
  imageDataUrl: z.string().nullable().optional(),
}).refine(
  (clip) => clip.imageMode !== 'override' || (typeof clip.imageDataUrl === 'string' && clip.imageDataUrl.length > 0),
  { message: 'Foto wajib di-upload untuk imageMode override' }
);

const RequestSchema = z.object({
  generationId: z.string().min(1),
  styleNotes: z.string().max(1500).default(''),
  clips: z.array(ClipDraftSchema).min(2).max(6),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.format() }, { status: 400 });
    }

    const { generationId, styleNotes, clips: clipDrafts } = parsed.data;
    const db = await getDb();

    const pendingCount = await db.collection('JobQueue').countDocuments({ status: 'pending' });
    if (pendingCount >= MAX_QUEUE_DEPTH) {
      return NextResponse.json({ error: 'Server sedang sibuk. Coba lagi sebentar.' }, { status: 503 });
    }

    const generation = await db.collection('Generations').findOne({ _id: new ObjectId(generationId) });
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    const now = new Date();
    const existingClips = (generation.clips ?? []) as Clip[];
    const clips: Clip[] = clipDrafts.map((draft) => {
      const existing = existingClips.find((c) => c.index === draft.index);
      return {
        index: draft.index,
        prompt: draft.prompt,
        imageMode: draft.imageMode,
        imageDataUrl: draft.imageDataUrl ?? null,
        generated_image_path: null,
        generated_video_path: null,
        image_status: 'pending' as const,
        video_status: 'pending' as const,
        image_error: null,
        video_error: null,
        media_generation_id: null,
        video_job_id: null,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
    }).sort((a, b) => a.index - b.index);

    await db.collection('Generations').updateOne(
      { _id: new ObjectId(generationId) },
      {
        $set: {
          styleNotes,
          clips,
          status: 'queued',
          progress: 0,
          progress_label: 'Antrian video',
          updated_at: now,
        },
      }
    );

    await enqueueJob(generationId, {
      productImageUrl: generation.product_image_url,
      modelImageUrl: generation.model_image_url ?? null,
      basicIdea: generation.brief ?? '',
      storyboardCount: clips.length,
      product: generation.productAnalysis,
      model: generation.modelAnalysis ?? null,
      v2Studio: true,
    } as unknown as Parameters<typeof enqueueJob>[1]);

    return NextResponse.json({ generationId, status: 'queued' });
  } catch (error) {
    console.error('/api/studio/generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2.4 POST /api/studio/regenerate-clip

- [ ] **Step 1: Create file**

```bash
mkdir -p app/api/studio/regenerate-clip
touch app/api/studio/regenerate-clip/route.ts
```

- [ ] **Step 2: Write implementation**

Write to `app/api/studio/regenerate-clip/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { enqueueJob } from '@/app/lib/queue';
import type { Clip } from '@/app/lib/types';

const RequestSchema = z.object({
  generationId: z.string().min(1),
  clipIndex: z.number().int().min(0).max(5),
  prompt: z.string().min(10).max(2000),
  imageMode: z.enum(['inherit', 'override', 'ai-generate']),
  imageDataUrl: z.string().nullable().optional(),
}).refine(
  (data) => data.imageMode !== 'override' || (typeof data.imageDataUrl === 'string' && data.imageDataUrl.length > 0),
  { message: 'Foto wajib di-upload untuk imageMode override' }
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.format() }, { status: 400 });
    }

    const { generationId, clipIndex, prompt, imageMode, imageDataUrl } = parsed.data;
    const db = await getDb();

    const generation = await db.collection('Generations').findOne({ _id: new ObjectId(generationId) });
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    const clips = (generation.clips ?? []) as Clip[];
    const targetClip = clips.find((c) => c.index === clipIndex);
    if (!targetClip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    const now = new Date();
    const updatedClips = clips.map((c) =>
      c.index === clipIndex
        ? {
            ...c,
            prompt,
            imageMode,
            imageDataUrl: imageDataUrl ?? null,
            generated_image_path: null,
            generated_video_path: null,
            image_status: 'pending' as const,
            video_status: 'pending' as const,
            image_error: null,
            video_error: null,
            media_generation_id: null,
            video_job_id: null,
            updated_at: now,
          }
        : c
    );

    await db.collection('Generations').updateOne(
      { _id: new ObjectId(generationId) },
      {
        $set: {
          clips: updatedClips,
          status: 'queued',
          progress_label: `Regenerating clip ${clipIndex + 1}`,
          updated_at: now,
        },
      }
    );

    await enqueueJob(generationId, {
      productImageUrl: generation.product_image_url,
      modelImageUrl: generation.model_image_url ?? null,
      basicIdea: generation.brief ?? '',
      storyboardCount: 1,
      product: generation.productAnalysis,
      model: generation.modelAnalysis ?? null,
      v2Studio: true,
      v2RegenerateClipIndex: clipIndex,
    } as unknown as Parameters<typeof enqueueJob>[1]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('/api/studio/regenerate-clip error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2.5 Extend GET /api/generations/[id]

- [ ] **Step 1: Read existing route**

```bash
cat app/api/generations/[id]/route.ts
```

- [ ] **Step 2: Add v2 + legacy branches at start of GET handler**

After fetching the generation document, BEFORE the existing v1 response logic, add:

```ts
const isLegacy = generation.format_version === 'legacy';
const isV2 = !isLegacy && Array.isArray(generation.clips);

if (isV2) {
  return NextResponse.json({
    id: generation._id.toString(),
    format_version: 'v2',
    status: generation.status,
    progress: generation.progress,
    progressLabel: generation.progress_label,
    productIdentifier: generation.product_identifier,
    creativeIdeaTitle: generation.creative_idea_title,
    productAnalysis: generation.productAnalysis,
    modelAnalysis: generation.modelAnalysis,
    brief: generation.brief,
    ideas: generation.ideas ?? [],
    selectedIdeaIndex: generation.selectedIdeaIndex,
    styleNotes: generation.styleNotes,
    clips: generation.clips ?? [],
    error: generation.error_message,
    createdAt: generation.created_at,
    updatedAt: generation.updated_at,
  });
}

if (isLegacy) {
  return NextResponse.json({
    id: generation._id.toString(),
    format_version: 'legacy',
    status: generation.status,
    productIdentifier: generation.product_identifier,
    creativeIdeaTitle: generation.creative_idea_title,
    createdAt: generation.created_at,
    error: 'This generation was created with an older version. Please delete and re-create.',
  });
}

// (existing v1 response below — leave unchanged)
```

- [ ] **Step 3: Add DELETE handler if missing**

If the file has no `DELETE` export, append:

```ts
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    const result = await db.collection('Generations').deleteOne({ _id: new ObjectId(params.id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 500 });
  }
}
```

### 2.6 Verify & Commit Chunk 2

- [ ] **Step 1: Build check**

```bash
npm run build
```
Expected: No errors.

- [ ] **Step 2: Smoke test ideas endpoint**

In one terminal: `npm run dev`. In another:

```bash
TEST_IMG="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
curl -X POST http://localhost:3000/api/studio/ideas \
  -H "Content-Type: application/json" \
  -d "{\"productImageUrl\": \"$TEST_IMG\", \"brief\": \"skincare untuk kulit kering\"}" \
  | head -50
```
Expected: JSON with `generationId`, `productAnalysis`, `modelAnalysis`, `ideas` array. LLM may hallucinate from 1x1 pixel — that's OK.

- [ ] **Step 3: Commit**

```bash
git add app/api/studio/ app/api/generations/\[id\]/route.ts
git commit -m "feat(api): add v2 studio endpoints (ideas, expand, generate, regenerate-clip)"
```

---

## Chunk 3 — Worker v2 Pipeline

**Goal:** Add v2 generation logic in new file. Add minimal v2 detection branch at top of existing `runGeneration.ts`. **Do not delete v1 worker logic.**

### 3.1 Create runV2Generation.ts

- [ ] **Step 1: Create file**

```bash
touch worker/runV2Generation.ts
```

- [ ] **Step 2: Write implementation**

Write to `worker/runV2Generation.ts`:

```ts
import { ObjectId } from 'mongodb';
import { getDb } from '@/app/lib/mongoClient';
import { uploadImageAsset, createVideoJob, waitForVideo } from '@/app/lib/useapi';
import { generateImage, resolvePreset } from '@/app/lib/llm';
import { saveImage, downloadAndSaveVideo, storagePathToUrl } from '@/app/lib/storage';
import type { Clip } from '@/app/lib/types';

interface V2Payload {
  productImageUrl: string;
  modelImageUrl?: string | null;
  basicIdea: string;
  storyboardCount: number;
  product: unknown;
  model: unknown | null;
  v2Studio: true;
  v2RegenerateClipIndex?: number;
}

const CLIP_CONCURRENCY = 2;

export async function runV2StudioGeneration(jobId: string, generationId: string, payload: V2Payload) {
  const db = await getDb();
  const oid = new ObjectId(generationId);

  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        status: 'processing',
        progress: 10,
        progress_label: 'Memulai generation',
        updated_at: new Date(),
      },
    }
  );

  const gen = await db.collection('Generations').findOne({ _id: oid });
  if (!gen) throw new Error(`Generation ${generationId} not found`);

  const styleNotes = (gen.styleNotes ?? '') as string;
  const allClips = (gen.clips ?? []) as Clip[];
  const productImageUrl = gen.product_image_url as string;
  const modelConfig = gen.modelConfig ?? resolvePreset('balanced');

  const clipsToProcess =
    typeof payload.v2RegenerateClipIndex === 'number'
      ? allClips.filter((c) => c.index === payload.v2RegenerateClipIndex)
      : allClips;

  await processWithConcurrency(clipsToProcess, CLIP_CONCURRENCY, async (clip) => {
    try {
      await generateClipAssets(generationId, clip, styleNotes, productImageUrl, modelConfig, jobId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await db.collection('Generations').updateOne(
        { _id: oid },
        {
          $set: {
            'clips.$[c].video_status': 'failed',
            'clips.$[c].video_error': errMsg,
            'clips.$[c].updated_at': new Date(),
          },
        },
        { arrayFilters: [{ 'c.index': clip.index }] }
      );
    }
  });

  const allClipsAfter = ((await db.collection('Generations').findOne({ _id: oid }))?.clips ?? []) as Clip[];
  const allDone = allClipsAfter.every((c) => c.video_status === 'done');
  const anyFailed = allClipsAfter.some((c) => c.video_status === 'failed');

  const finalStatus = allDone ? 'completed' : anyFailed ? 'partial' : 'failed';
  const successCount = allClipsAfter.filter((c) => c.video_status === 'done').length;

  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        status: finalStatus,
        progress: 100,
        progress_label: `${successCount}/${allClipsAfter.length} clip selesai`,
        updated_at: new Date(),
      },
    }
  );
}

async function generateClipAssets(
  generationId: string,
  clip: Clip,
  styleNotes: string,
  productImageUrl: string,
  modelConfig: unknown,
  jobId: string
) {
  const db = await getDb();
  const oid = new ObjectId(generationId);
  const arrayFilters = [{ 'c.index': clip.index }];

  // Step 1: Resolve image source
  await db.collection('Generations').updateOne(
    { _id: oid },
    { $set: { 'clips.$[c].image_status': 'generating', 'clips.$[c].updated_at': new Date() } },
    { arrayFilters }
  );

  let imageData: string;
  if (clip.imageMode === 'inherit') {
    imageData = productImageUrl;
  } else if (clip.imageMode === 'override') {
    if (!clip.imageDataUrl) throw new Error('imageMode=override missing imageDataUrl');
    imageData = clip.imageDataUrl;
  } else {
    const imagePrompt = `${styleNotes}\n\n${clip.prompt}`;
    const imgRes = await generateImage(
      imagePrompt,
      { aspectRatio: '16:9' },
      modelConfig as Parameters<typeof generateImage>[2],
      jobId
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

  const mediaGenerationId = await uploadImageAsset(imageData);
  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        'clips.$[c].image_status': 'done',
        'clips.$[c].media_generation_id': mediaGenerationId,
        'clips.$[c].updated_at': new Date(),
      },
    },
    { arrayFilters }
  );

  // Step 2: Veo
  await db.collection('Generations').updateOne(
    { _id: oid },
    { $set: { 'clips.$[c].video_status': 'queued' } },
    { arrayFilters }
  );

  const finalPrompt = styleNotes ? `${styleNotes}\n\n${clip.prompt}` : clip.prompt;
  const veoJobId = await createVideoJob({
    imageUrl: mediaGenerationId,
    prompt: finalPrompt,
    model: 'veo-3.1-fast',
    aspectRatio: 'landscape',
  });

  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        'clips.$[c].video_status': 'generating',
        'clips.$[c].video_job_id': veoJobId,
      },
    },
    { arrayFilters }
  );

  const videoUrl = await waitForVideo(veoJobId);
  const videoFilePath = await downloadAndSaveVideo(videoUrl, generationId, `clip-${clip.index}.mp4`);
  const videoPublicUrl = storagePathToUrl(videoFilePath);

  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        'clips.$[c].video_status': 'done',
        'clips.$[c].generated_video_path': videoPublicUrl,
        'clips.$[c].updated_at': new Date(),
      },
    },
    { arrayFilters }
  );
}

async function processWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
```

### 3.2 Add v2 Detection Branch in runGeneration.ts

- [ ] **Step 1: Read existing entry point**

```bash
head -40 worker/runGeneration.ts
```

- [ ] **Step 2: Add v2 branch at top of main exported function**

In `worker/runGeneration.ts`, locate the main function (likely `runGeneration` or similar). Add at the very start of the function body (after argument destructure but before any v1 logic):

```ts
import { runV2StudioGeneration } from './runV2Generation';

// ... existing imports ...

export async function runGeneration(/* existing args */) {
  // ... existing setup if any ...

  // V2 Studio Clean Flow branch
  if ((payload as Record<string, unknown>).v2Studio === true) {
    await runV2StudioGeneration(jobId, generationId, payload as unknown as Parameters<typeof runV2StudioGeneration>[2]);
    return;
  }

  // (existing v1 pipeline below — unchanged)
}
```

The exact placement depends on existing structure. The key requirement: the v2 detection MUST happen before any v1-specific code (e.g., before reading legacy fields like `creativeIdea`).

### 3.3 Verify & Commit Chunk 3

- [ ] **Step 1: Build check**

```bash
npm run build
```

- [ ] **Step 2: Commit**

```bash
git add worker/runV2Generation.ts worker/runGeneration.ts
git commit -m "feat(worker): add v2 studio generation pipeline (parallel clip processing)"
```

---

## Chunk 4 — UI Components

**Goal:** Create all new components in `app/studio-v2/components/` and `app/components/`. Don't modify existing UI yet.

### 4.1 ImageSlot Component

- [ ] **Step 1: Create directory**

```bash
mkdir -p app/studio-v2/components
```

- [ ] **Step 2: Write `app/studio-v2/components/ImageSlot.tsx`**

```tsx
'use client';

import { useRef } from 'react';
import { Upload, Sparkles, Image as ImageIcon } from 'lucide-react';
import type { ClipImageMode } from '@/app/lib/types';

interface ImageSlotProps {
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;
  productPreview: string | null;
  onChange: (mode: ClipImageMode, imageDataUrl?: string | null) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImageSlot({ imageMode, imageDataUrl, productPreview, onChange }: ImageSlotProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    onChange('override', dataUrl);
  };

  const previewSrc =
    imageMode === 'override' ? imageDataUrl :
    imageMode === 'inherit' ? productPreview :
    null;

  return (
    <div className="flex items-center gap-2 text-xs">
      {previewSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewSrc} alt="clip image" className="w-12 h-8 object-cover rounded-md border" />
      ) : (
        <div className="w-12 h-8 rounded-md border bg-muted flex items-center justify-center">
          <ImageIcon className="w-3 h-3 text-muted-foreground" />
        </div>
      )}

      <span className="text-muted-foreground">
        {imageMode === 'inherit' && 'foto produk'}
        {imageMode === 'override' && 'foto khusus'}
        {imageMode === 'ai-generate' && 'AI generate'}
      </span>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="ml-auto px-2 py-1 rounded-md border hover:bg-muted flex items-center gap-1"
      >
        <Upload className="w-3 h-3" /> Ganti
      </button>

      <button
        type="button"
        onClick={() => onChange('ai-generate', null)}
        className={`px-2 py-1 rounded-md border flex items-center gap-1 ${
          imageMode === 'ai-generate' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
        }`}
      >
        <Sparkles className="w-3 h-3" /> AI
      </button>

      {imageMode !== 'inherit' && (
        <button
          type="button"
          onClick={() => onChange('inherit', null)}
          className="px-2 py-1 rounded-md border hover:bg-muted text-muted-foreground"
        >
          Reset
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
        }}
      />
    </div>
  );
}
```

### 4.2 StyleNotesField Component

- [ ] **Step 1: Write `app/studio-v2/components/StyleNotesField.tsx`**

```tsx
'use client';

import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Sparkles } from 'lucide-react';

interface StyleNotesFieldProps {
  value: string;
  onChange: (v: string) => void;
}

export function StyleNotesField({ value, onChange }: StyleNotesFieldProps) {
  return (
    <div className="space-y-2 border-2 border-dashed rounded-2xl p-4 bg-muted/30">
      <Label className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        Style Notes
        <span className="text-xs text-muted-foreground font-normal">
          (auto-fill, di-prepend ke setiap clip prompt)
        </span>
      </Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Produk: ... Model: ... Tone: ..."
        rows={4}
        className="text-sm"
        maxLength={1500}
      />
      <p className="text-[10px] text-right text-muted-foreground">{value.length} / 1500</p>
    </div>
  );
}
```

### 4.3 ClipEditor Component

- [ ] **Step 1: Write `app/studio-v2/components/ClipEditor.tsx`**

```tsx
'use client';

import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Plus, Trash2, Video, Loader2 } from 'lucide-react';
import type { ClipImageMode } from '@/app/lib/types';
import { ImageSlot } from './ImageSlot';
import { StyleNotesField } from './StyleNotesField';

export interface ClipDraft {
  index: number;
  prompt: string;
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;
}

interface ClipEditorProps {
  styleNotes: string;
  onStyleNotesChange: (v: string) => void;
  clips: ClipDraft[];
  onClipsChange: (clips: ClipDraft[]) => void;
  productPreview: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}

const MAX_CLIPS = 6;
const MIN_CLIPS = 2;

export function ClipEditor({
  styleNotes,
  onStyleNotesChange,
  clips,
  onClipsChange,
  productPreview,
  submitting,
  onSubmit,
  onBack,
}: ClipEditorProps) {
  const updateClip = (index: number, updates: Partial<ClipDraft>) => {
    onClipsChange(clips.map((c) => (c.index === index ? { ...c, ...updates } : c)));
  };

  const addClip = () => {
    if (clips.length >= MAX_CLIPS) return;
    const nextIndex = Math.max(...clips.map((c) => c.index)) + 1;
    onClipsChange([...clips, { index: nextIndex, prompt: '', imageMode: 'inherit' }]);
  };

  const removeClip = (index: number) => {
    if (clips.length <= MIN_CLIPS) return;
    onClipsChange(clips.filter((c) => c.index !== index).map((c, i) => ({ ...c, index: i })));
  };

  const canSubmit =
    !submitting && clips.length >= MIN_CLIPS && clips.every((c) => c.prompt.trim().length >= 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
          ← Kembali
        </button>
      </div>

      <StyleNotesField value={styleNotes} onChange={onStyleNotesChange} />

      <div className="space-y-3">
        <Label>
          Clips ({clips.length} × 8 detik = ~{clips.length * 8} detik total)
        </Label>

        {clips.map((clip, idx) => (
          <div key={clip.index} className="border rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Clip {idx + 1} (8 detik)</span>
              {clips.length > MIN_CLIPS && (
                <button
                  type="button"
                  onClick={() => removeClip(clip.index)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <Textarea
              value={clip.prompt}
              onChange={(e) => updateClip(clip.index, { prompt: e.target.value })}
              placeholder="Describe the visual scene, action, mood for this 8-second clip..."
              rows={4}
              className="text-sm"
              maxLength={2000}
            />
            <p className="text-[10px] text-right text-muted-foreground">{clip.prompt.length} / 2000</p>

            <ImageSlot
              imageMode={clip.imageMode}
              imageDataUrl={clip.imageDataUrl}
              productPreview={productPreview}
              onChange={(mode, dataUrl) =>
                updateClip(clip.index, { imageMode: mode, imageDataUrl: dataUrl ?? null })
              }
            />
          </div>
        ))}

        {clips.length < MAX_CLIPS && (
          <button
            type="button"
            onClick={addClip}
            className="w-full border-2 border-dashed rounded-xl py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Tambah Clip
          </button>
        )}
      </div>

      <Button size="lg" className="w-full" disabled={!canSubmit} onClick={onSubmit}>
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Menyiapkan video...
          </>
        ) : (
          <>
            <Video className="w-5 h-5 mr-2" />
            Buat Video
          </>
        )}
      </Button>
    </div>
  );
}
```

### 4.4 IdeaPicker Component

- [ ] **Step 1: Write `app/studio-v2/components/IdeaPicker.tsx`**

```tsx
'use client';

import { Button } from '@/app/components/ui/button';
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';
import type { Idea } from '@/app/lib/types';

interface IdeaPickerProps {
  ideas: Idea[];
  regenerating: boolean;
  picking: boolean;
  onRegenerate: () => void;
  onPick: (index: number) => void;
  onBack: () => void;
}

export function IdeaPicker({ ideas, regenerating, picking, onRegenerate, onPick, onBack }: IdeaPickerProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>
      </div>

      <div>
        <h2 className="text-xl font-bold">Pilih Ide Iklan</h2>
        <p className="text-sm text-muted-foreground mt-1">
          AI generate {ideas.length} ide. Pilih salah satu untuk lanjut ke editor clip.
        </p>
      </div>

      <div className="space-y-3">
        {ideas.map((idea, idx) => (
          <div
            key={idx}
            className={`border-2 rounded-xl p-4 hover:border-primary transition-colors ${picking ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <h3 className="font-semibold text-sm mb-2">[{idx + 1}] {idea.title}</h3>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{idea.content}</p>
            <Button size="sm" onClick={() => onPick(idx)} disabled={picking}>
              {picking ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Menyiapkan...
                </>
              ) : (
                'Pilih Ide Ini →'
              )}
            </Button>
          </div>
        ))}
      </div>

      <Button variant="outline" size="lg" className="w-full" onClick={onRegenerate} disabled={regenerating || picking}>
        {regenerating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Generate ide baru...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            Generate Ide Baru
          </>
        )}
      </Button>
    </div>
  );
}
```

### 4.5 StudioInput Component

- [ ] **Step 1: Write `app/studio-v2/components/StudioInput.tsx`**

```tsx
'use client';

import { useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Upload, X, Loader2, Sparkles } from 'lucide-react';

interface StudioInputProps {
  productPreview: string | null;
  modelPreview: string | null;
  brief: string;
  submitting: boolean;
  error: string | null;
  onProductChange: (dataUrl: string | null) => void;
  onModelChange: (dataUrl: string | null) => void;
  onBriefChange: (v: string) => void;
  onSubmit: () => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function StudioInput({
  productPreview,
  modelPreview,
  brief,
  submitting,
  error,
  onProductChange,
  onModelChange,
  onBriefChange,
  onSubmit,
}: StudioInputProps) {
  const productRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);

  const handleProductFile = async (file: File) => onProductChange(await fileToDataUrl(file));
  const handleModelFile = async (file: File) => onModelChange(await fileToDataUrl(file));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Buat Iklan dengan AI</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload foto produk + brief. AI generate ide & clip prompts.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PhotoUpload
          label="Foto Produk"
          required
          preview={productPreview}
          fileRef={productRef}
          onClear={() => onProductChange(null)}
          onFile={handleProductFile}
        />
        <PhotoUpload
          label="Foto Model"
          optional
          preview={modelPreview}
          fileRef={modelRef}
          onClear={() => onModelChange(null)}
          onFile={handleModelFile}
        />
      </div>

      <div className="space-y-2">
        <Label>
          Brief <span className="text-muted-foreground text-sm font-normal">(optional)</span>
        </Label>
        <Textarea
          placeholder="Skincare untuk kulit berminyak, target ibu muda, tone fresh..."
          value={brief}
          onChange={(e) => onBriefChange(e.target.value)}
          rows={3}
          maxLength={500}
        />
        <p className="text-[10px] text-right text-muted-foreground">{brief.length} / 500</p>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <Button size="lg" className="w-full text-base" disabled={submitting || !productPreview} onClick={onSubmit}>
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Menganalisis foto + brainstorming ide...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 mr-2" />
            Generate Ide
          </>
        )}
      </Button>
      {!productPreview && (
        <p className="text-xs text-muted-foreground text-center -mt-2">Upload foto produk untuk mulai.</p>
      )}
    </div>
  );
}

function PhotoUpload({
  label,
  required,
  optional,
  preview,
  fileRef,
  onClear,
  onFile,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  preview: string | null;
  fileRef: React.RefObject<HTMLInputElement>;
  onClear: () => void;
  onFile: (f: File) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
        {optional && <span className="text-muted-foreground text-sm font-normal"> (optional)</span>}
      </Label>
      <div
        className="relative border-2 border-dashed rounded-xl cursor-pointer hover:border-primary transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={label} className="w-full h-36 object-contain rounded-xl" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 hover:bg-black/80"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Klik untuk upload</span>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}
```

### 4.6 ClipResults Component

- [ ] **Step 1: Write `app/components/ClipResults.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Loader2, RefreshCw, Download, AlertCircle } from 'lucide-react';
import type { Clip } from '@/app/lib/types';

interface ClipResultsProps {
  generationId: string;
  clips: Clip[];
  onClipUpdated?: () => void;
}

export function ClipResults({ generationId, clips, onClipUpdated }: ClipResultsProps) {
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  const handleRegenerate = async (clip: Clip) => {
    setRegeneratingIndex(clip.index);
    try {
      const res = await fetch('/api/studio/regenerate-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId,
          clipIndex: clip.index,
          prompt: clip.prompt,
          imageMode: clip.imageMode,
          imageDataUrl: clip.imageMode === 'override' ? clip.imageDataUrl : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Gagal regenerate: ${err.error ?? res.statusText}`);
      } else {
        onClipUpdated?.();
      }
    } catch (err) {
      alert(`Gagal regenerate: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setRegeneratingIndex(null);
    }
  };

  return (
    <div className="space-y-4">
      {clips.map((clip, idx) => (
        <Card key={clip.index}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">Clip {idx + 1} (8 detik)</div>
              <ClipStatusBadge status={clip.video_status} />
            </div>

            <ClipMediaPreview clip={clip} />

            <div className="text-xs text-muted-foreground line-clamp-2">{clip.prompt}</div>

            <div className="flex gap-2">
              {clip.generated_video_path && (
                <Button asChild size="sm" variant="outline">
                  <a href={clip.generated_video_path} download>
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={regeneratingIndex === clip.index}
                onClick={() => handleRegenerate(clip)}
              >
                {regeneratingIndex === clip.index ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Regenerate
                  </>
                )}
              </Button>
            </div>

            {clip.video_error && (
              <div className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {clip.video_error}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClipStatusBadge({ status }: { status: Clip['video_status'] }) {
  const labels: Record<Clip['video_status'], { text: string; className: string }> = {
    pending: { text: 'Menunggu', className: 'bg-muted text-muted-foreground' },
    queued: { text: 'Antrian', className: 'bg-muted text-muted-foreground' },
    generating: { text: 'Generating', className: 'bg-primary/10 text-primary' },
    done: { text: 'Selesai', className: 'bg-green-500/10 text-green-700' },
    failed: { text: 'Gagal', className: 'bg-destructive/10 text-destructive' },
  };
  const { text, className } = labels[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${className}`}>{text}</span>;
}

function ClipMediaPreview({ clip }: { clip: Clip }) {
  if (clip.video_status === 'done' && clip.generated_video_path) {
    return <video src={clip.generated_video_path} controls className="w-full rounded-lg bg-muted aspect-video" />;
  }
  if (clip.video_status === 'failed') {
    return (
      <div className="w-full rounded-lg bg-destructive/5 aspect-video flex items-center justify-center text-destructive text-sm">
        <AlertCircle className="w-5 h-5 mr-2" /> Gagal generate
      </div>
    );
  }
  return (
    <div className="w-full rounded-lg bg-muted animate-pulse aspect-video flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
    </div>
  );
}
```

### 4.7 LegacyFallback Component

- [ ] **Step 1: Write `app/components/LegacyFallback.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Trash2, AlertTriangle } from 'lucide-react';

interface LegacyFallbackProps {
  generationId: string;
  productIdentifier?: string;
  creativeIdeaTitle?: string;
}

export function LegacyFallback({ generationId, productIdentifier, creativeIdeaTitle }: LegacyFallbackProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Hapus generation lama "${creativeIdeaTitle ?? productIdentifier ?? generationId}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/generations/${generationId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Gagal hapus: ${err.error ?? res.statusText}`);
      } else {
        router.push('/history');
      }
    } catch (err) {
      alert(`Gagal hapus: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="font-semibold">Generation versi lama</h3>
            <p className="text-sm text-muted-foreground">
              Generation ini dibuat dengan flow lama (Hook/Problem/Solution/CTA) yang sudah tidak compatible
              dengan editor baru. Tidak ada migrasi otomatis — hapus dan buat ulang di Studio.
            </p>
            <p className="text-xs text-muted-foreground">
              {productIdentifier && (
                <>
                  Produk: <strong>{productIdentifier}</strong>.{' '}
                </>
              )}
              {creativeIdeaTitle && (
                <>
                  Ide: <strong>{creativeIdeaTitle}</strong>.
                </>
              )}
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
          <Trash2 className="w-4 h-4 mr-2" />
          {deleting ? 'Menghapus...' : 'Hapus Generation Ini'}
        </Button>
      </CardContent>
    </Card>
  );
}
```

### 4.8 Verify & Commit Chunk 4

- [ ] **Step 1: Build check**

```bash
npm run build
```

- [ ] **Step 2: Commit**

```bash
git add app/studio-v2/components/ app/components/ClipResults.tsx app/components/LegacyFallback.tsx
git commit -m "feat(components): add v2 UI components (ImageSlot, StyleNotesField, ClipEditor, IdeaPicker, StudioInput, ClipResults, LegacyFallback)"
```

---

## Chunk 5 — Studio Page v2 (Parallel Namespace)

**Goal:** Create `app/studio-v2/page.tsx` with full 3-step state machine. **Don't touch `app/studio/page.tsx` yet.**

- [ ] **Step 1: Write `app/studio-v2/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/app/components/TopBar';
import { StudioInput } from './components/StudioInput';
import { IdeaPicker } from './components/IdeaPicker';
import { ClipEditor, type ClipDraft } from './components/ClipEditor';
import type { Idea, ProductDescription, ModelDescription } from '@/app/lib/types';

type Step = 'input' | 'pick-idea' | 'edit-clips';

export default function StudioV2Page() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('input');

  const [productImage, setProductImage] = useState<string | null>(null);
  const [modelImage, setModelImage] = useState<string | null>(null);
  const [brief, setBrief] = useState('');

  const [generationId, setGenerationId] = useState<string | null>(null);
  const [_productAnalysis, setProductAnalysis] = useState<ProductDescription | null>(null);
  const [_modelAnalysis, setModelAnalysis] = useState<ModelDescription | null>(null);

  const [ideas, setIdeas] = useState<Idea[]>([]);

  const [styleNotes, setStyleNotes] = useState('');
  const [clips, setClips] = useState<ClipDraft[]>([]);

  const [generatingIdeas, setGeneratingIdeas] = useState(false);
  const [picking, setPicking] = useState(false);
  const [submittingVideo, setSubmittingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateIdeas = async () => {
    if (!productImage) {
      setError('Upload foto produk dulu.');
      return;
    }
    setGeneratingIdeas(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId,
          productImageUrl: productImage,
          modelImageUrl: modelImage,
          brief,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setGenerationId(data.generationId);
      setProductAnalysis(data.productAnalysis);
      setModelAnalysis(data.modelAnalysis);
      setIdeas(data.ideas);
      setStep('pick-idea');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal generate ide');
    } finally {
      setGeneratingIdeas(false);
    }
  };

  const handlePickIdea = async (selectedIdeaIndex: number) => {
    if (!generationId) return;
    setPicking(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId, selectedIdeaIndex }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStyleNotes(data.styleNotes ?? '');
      setClips(
        (data.clips as Array<{ index: number; prompt: string; imageMode: 'inherit' | 'override' | 'ai-generate' }>).map(
          (c) => ({ index: c.index, prompt: c.prompt, imageMode: c.imageMode, imageDataUrl: null })
        )
      );
      setStep('edit-clips');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal expand idea');
    } finally {
      setPicking(false);
    }
  };

  const handleSubmitVideo = async () => {
    if (!generationId) return;
    setSubmittingVideo(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId,
          styleNotes,
          clips: clips.map((c) => ({
            index: c.index,
            prompt: c.prompt,
            imageMode: c.imageMode,
            imageDataUrl: c.imageMode === 'override' ? c.imageDataUrl : null,
          })),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      router.push(`/generations/${generationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal submit video');
      setSubmittingVideo(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {step === 'input' && (
          <StudioInput
            productPreview={productImage}
            modelPreview={modelImage}
            brief={brief}
            submitting={generatingIdeas}
            error={error}
            onProductChange={setProductImage}
            onModelChange={setModelImage}
            onBriefChange={setBrief}
            onSubmit={handleGenerateIdeas}
          />
        )}

        {step === 'pick-idea' && (
          <IdeaPicker
            ideas={ideas}
            regenerating={generatingIdeas}
            picking={picking}
            onRegenerate={handleGenerateIdeas}
            onPick={handlePickIdea}
            onBack={() => setStep('input')}
          />
        )}

        {step === 'edit-clips' && (
          <ClipEditor
            styleNotes={styleNotes}
            onStyleNotesChange={setStyleNotes}
            clips={clips}
            onClipsChange={setClips}
            productPreview={productImage}
            submitting={submittingVideo}
            onSubmit={handleSubmitVideo}
            onBack={() => setStep('pick-idea')}
          />
        )}

        {error && step !== 'input' && (
          <div className="mt-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/studio-v2/page.tsx
git commit -m "feat(studio-v2): add 3-step state machine page (parallel namespace)"
```

---

## Chunk 6 — Generation Detail Page v2 Support

**Goal:** Update `app/generations/[id]/page.tsx` to render `ClipResults` for v2 or `LegacyFallback` for legacy. Update `GenerationHistory.tsx` to show legacy badge. **Keep v1 fallback render for any docs without `format_version` flag yet.**

### 6.1 Update Generation Detail Page

- [ ] **Step 1: Read existing file structure**

```bash
head -50 app/generations/[id]/page.tsx
```

- [ ] **Step 2: Add imports at top of file**

Add to imports section:

```tsx
import { ClipResults } from '@/app/components/ClipResults';
import { LegacyFallback } from '@/app/components/LegacyFallback';
import type { Clip } from '@/app/lib/types';
```

- [ ] **Step 3: Add v2/legacy state**

In the page component, add state for the format-aware data alongside existing state:

```tsx
const [v2Data, setV2Data] = useState<{
  format_version?: 'v2' | 'legacy';
  productIdentifier?: string;
  creativeIdeaTitle?: string;
  clips?: Clip[];
} | null>(null);
```

- [ ] **Step 4: Capture format_version in fetchGeneration**

Inside the `fetchGeneration` function (or wherever the API response is parsed), add:

```tsx
if (data.format_version === 'v2' || data.format_version === 'legacy') {
  setV2Data({
    format_version: data.format_version,
    productIdentifier: data.productIdentifier,
    creativeIdeaTitle: data.creativeIdeaTitle,
    clips: data.clips ?? [],
  });
}
```

- [ ] **Step 5: Add render branches**

In the page render (where `<ResultsDisplay>` is currently rendered), wrap it with conditional logic:

```tsx
{v2Data?.format_version === 'legacy' ? (
  <LegacyFallback
    generationId={id}
    productIdentifier={v2Data.productIdentifier}
    creativeIdeaTitle={v2Data.creativeIdeaTitle}
  />
) : v2Data?.format_version === 'v2' && v2Data.clips ? (
  <ClipResults
    generationId={id}
    clips={v2Data.clips}
    onClipUpdated={() => fetchGeneration()}
  />
) : (
  // existing v1 render (ResultsDisplay) — leave unchanged
  <ResultsDisplay {...existingProps} />
)}
```

The exact integration depends on existing structure. Goal: v2 and legacy take precedence, v1 falls back if neither flag matches.

### 6.2 Update GenerationHistory

- [ ] **Step 1: Read current implementation**

```bash
grep -n "format_version\|export" app/components/GenerationHistory.tsx | head
```

- [ ] **Step 2: Add legacy badge**

In `app/components/GenerationHistory.tsx`, locate where each generation card is rendered (look for `.map((g)` or similar). Add a badge near the title:

```tsx
{generation.format_version === 'legacy' && (
  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 ml-2">
    legacy
  </span>
)}
```

If the type for the list item doesn't include `format_version`, add it.

### 6.3 Verify & Commit Chunk 6

- [ ] **Step 1: Build check**

```bash
npm run build
```

- [ ] **Step 2: Commit**

```bash
git add app/generations/\[id\]/page.tsx app/components/GenerationHistory.tsx
git commit -m "feat(generations): support v2 ClipResults + legacy fallback in detail page; add legacy badge in history"
```

---

## Chunk 7 — Smoke Test v2 Standalone

**Goal:** Verify v2 flow end-to-end via `/studio-v2` without touching v1 path. Find bugs before swap.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Start worker (separate terminal)**

```bash
npm run worker
```

(Or whatever the worker start command is — check `package.json`.)

- [ ] **Step 3: Open `http://localhost:3000/studio-v2` in browser**

- [ ] **Step 4: Run happy path**

- Upload real foto produk + foto model
- Brief: "Skincare untuk kulit berminyak"
- Click "Generate Ide" → wait 5-15s → verify Step 2 shows 3-5 idea cards (title + paragraph)
- Click "Generate Ide Baru" → verify new ideas (vision call fires fresh)
- Click "Pilih Ide Ini" on first idea → wait 3-5s → verify Step 3 shows Style Notes auto-filled + 4 clip textareas auto-filled
- Click "Buat Video" → verify redirect to `/generations/<id>`
- Wait for clips to generate → verify each clip eventually shows video preview + Download/Regenerate buttons

- [ ] **Step 5: Run edge cases**

- Without foto model — verify ideas still generate
- Override foto on clip 2 — verify clip 2 video uses uploaded photo
- AI mode on clip 3 — verify image generates first, then video
- Add clip 5 → submit → verify 5-clip video output
- Regenerate clip 2 from detail page — verify only clip 2 re-runs

- [ ] **Step 6: Document bugs**

If bugs found, fix inline and commit:

```bash
git add -A
git commit -m "fix: <description from smoke test>"
```

If no bugs, no commit needed for this chunk.

- [ ] **Step 7: Build & lint check**

```bash
npm run build
npm run lint 2>&1 | tail -20
```

Fix any blocking errors.

---

## Chunk 8 — ATOMIC SWAP & CLEANUP (Big Commit)

**Goal:** Single atomic commit that:
1. Renames `app/studio-v2/` → `app/studio/`
2. Deletes ALL deadcode/deadfile from catalog
3. Cleans up legacy v1 LLM functions, prompts, layer names
4. Runs MongoDB migration

**Verify backup exists before proceeding.**

```bash
ls -la backup-*
```

### 8.1 Rename Studio Folder

- [ ] **Step 1: Delete old studio page (will be replaced)**

```bash
rm app/studio/page.tsx
```

- [ ] **Step 2: Move v2 to studio**

```bash
mv app/studio-v2/page.tsx app/studio/page.tsx
mv app/studio-v2/components app/studio/components
rmdir app/studio-v2
```

- [ ] **Step 3: Update import paths in `app/studio/page.tsx`**

The page imports `./components/StudioInput`, `./components/IdeaPicker`, `./components/ClipEditor` — these still resolve correctly because we moved the folder. Verify:

```bash
grep "from './components" app/studio/page.tsx
```

No changes needed if the imports are relative. Skip if already correct.

### 8.2 Delete Old API Routes

- [ ] **Step 1: Delete dirs**

```bash
rm -rf app/api/analyze-images
rm -rf app/api/generate-creative-ideas
rm -rf app/api/generate-enhanced
rm -rf app/api/generate-directors-script
```

### 8.3 Delete Old Components

- [ ] **Step 1: Delete files**

```bash
rm app/components/ResultsDisplay.tsx
rm app/components/SceneAssetPanel.tsx
rm app/components/InputForm.tsx
```

- [ ] **Step 2: Check JobStatus.tsx usage**

```bash
grep -rn "JobStatus" app/ --include="*.tsx" --include="*.ts" | grep -v "JobStatus.tsx:"
```

If no remaining references, delete:

```bash
rm app/components/JobStatus.tsx
```

If still referenced (e.g., by the v2 detail page), keep it.

### 8.4 Remove v1 from Generation Detail Page

- [ ] **Step 1: Remove ResultsDisplay import + render branch**

Edit `app/generations/[id]/page.tsx`:

- Delete `import { ResultsDisplay } from '@/app/components/ResultsDisplay'` (now broken).
- Replace fallback `<ResultsDisplay {...} />` with nothing — keep only v2 and legacy branches:

```tsx
{v2Data?.format_version === 'legacy' ? (
  <LegacyFallback ... />
) : v2Data?.format_version === 'v2' && v2Data.clips ? (
  <ClipResults ... />
) : (
  <div className="text-center py-12 text-muted-foreground">
    {loading ? 'Loading...' : 'Generation tidak compatible.'}
  </div>
)}
```

Any v1 docs without `format_version` will hit the fallback message. They should already be marked `legacy` by the migration script (Step 8.8).

### 8.5 Clean LLM v1 Code

- [ ] **Step 1: Edit `app/lib/llm/index.ts`**

Delete these functions and their usage (they're no longer imported anywhere after API/worker cleanup):

- `visionDescribeProduct`
- `visionDescribeModel`
- `genericModelDescribe`
- `ideation50`
- `extractIdeasArray` (private helper for ideation50)
- `script5`
- `enrichVisualPrompts`

Also remove their imports of unused prompts. After cleanup, the only remaining functions should be:

- `chat` (private helper, kept)
- `cfg` (private helper, kept)
- `getModelDim` (private helper, kept)
- `visionCombined`
- `ideateFromImages`
- `expandToClips`
- `embedBatch`, `embedSingle` (kept — Script Bank doesn't use them, but they're harmless)
- `generateImage` (used by v2 worker for ai-generate mode)

Update import statement at top to remove unused prompt imports:

```ts
import {
  VISION_COMBINED_PROMPT,
  IDEAS_SYSTEM,
  IDEAS_USER,
  EXPAND_SYSTEM,
  EXPAND_USER,
} from './prompts';
```

- [ ] **Step 2: Edit `app/lib/llm/prompts.ts`**

Delete these constants:

- `VISION_PRODUCT_PROMPT`
- `VISION_MODEL_PROMPT`
- `GENERIC_MODEL_PROMPT`
- `IDEATION_SYSTEM`
- `IDEATION_USER`
- `SCRIPTING_SYSTEM`
- `SCRIPTING_USER`
- `VISUAL_PROMPT_SYSTEM`
- `VISUAL_PROMPT_USER`

Keep only:

- `VISION_COMBINED_PROMPT`
- `IDEAS_SYSTEM`, `IDEAS_USER`
- `EXPAND_SYSTEM`, `EXPAND_USER`

- [ ] **Step 3: Edit `app/lib/llm/registry.ts`**

In `MODEL_REGISTRY`, delete these layer entries: `embedding`, `scripting`, `visualPrompt`. Keep: `vision`, `ideation`, `text2img`, `ideas`, `expand`.

In `PRESETS`, delete the corresponding fields: `embedding`, `scripting`, `visualPrompt`.

Resulting `PRESETS`:

```ts
export const PRESETS: Record<Exclude<PresetName, 'custom'>, Omit<ModelConfig, 'preset'>> = {
  fast: {
    vision: 'google/gemini-2.5-flash',
    ideation: 'google/gemini-2.5-flash',
    text2img: 'google/gemini-2.5-flash-image',
    ideas: 'google/gemini-2.5-flash',
    expand: 'google/gemini-2.5-flash',
  },
  balanced: {
    vision: 'google/gemini-2.5-pro',
    ideation: 'google/gemini-2.5-flash',
    text2img: 'google/gemini-2.5-flash-image',
    ideas: 'google/gemini-2.5-flash',
    expand: 'deepseek/deepseek-v3.2',
  },
  premium: {
    vision: 'anthropic/claude-sonnet-4.6',
    ideation: 'google/gemini-2.5-pro',
    text2img: 'google/gemini-3.1-flash-image-preview',
    ideas: 'anthropic/claude-sonnet-4.6',
    expand: 'anthropic/claude-sonnet-4.6',
  },
};
```

- [ ] **Step 4: Edit `app/lib/llm/types.ts`**

Update `LayerName` and `ModelConfig`:

```ts
export type LayerName = 'vision' | 'ideation' | 'text2img' | 'ideas' | 'expand';

export type PresetName = 'fast' | 'balanced' | 'premium' | 'custom';

export interface ModelConfig {
  preset: PresetName;
  vision: string;
  ideation: string;
  text2img: string;
  ideas: string;
  expand: string;
}
```

Note: `ideation` is kept because v2 keeps it as conceptual "ideation layer" — actually `ideas` and `ideation` are duplicate. Delete `ideation` from both `LayerName` and `ModelConfig`. Adjust `PRESETS` accordingly:

```ts
export type LayerName = 'vision' | 'text2img' | 'ideas' | 'expand';

export interface ModelConfig {
  preset: PresetName;
  vision: string;
  text2img: string;
  ideas: string;
  expand: string;
}
```

Also remove `ideation` from `MODEL_REGISTRY` and `PRESETS` in registry.ts.

### 8.6 Delete v1 Worker Logic

- [ ] **Step 1: Edit `worker/runGeneration.ts`**

After the v2 branch (`if ((payload as Record<string, unknown>).v2Studio === true)`), DELETE everything that follows (the v1 pipeline). The function body should be:

```ts
export async function runGeneration(/* args */) {
  // ... minimal setup if any (jobId, generationId destructure) ...

  if ((payload as Record<string, unknown>).v2Studio === true) {
    await runV2StudioGeneration(jobId, generationId, payload as unknown as Parameters<typeof runV2StudioGeneration>[2]);
    return;
  }

  // No more v1 pipeline — all generations now use v2.
  throw new Error(`Unsupported job payload — only v2 studio generation is supported.`);
}
```

- [ ] **Step 2: Delete v1-only worker files (if any standalone)**

```bash
ls worker/
# Identify any v1-only file (e.g., generateAssets.ts if it has v1 logic)
```

If `worker/generateAssets.ts` is now unused (v2 has its own asset generation in `runV2Generation.ts`), delete it:

```bash
rm worker/generateAssets.ts
```

Verify no remaining imports:

```bash
grep -rn "generateAssets" worker/ app/ --include="*.ts"
```

### 8.7 Clean workerConfig

- [ ] **Step 1: Edit `app/lib/workerConfig.ts`**

Delete unused constants. Keep only:

```ts
export const STANDARD_CONCURRENCY = 2;
export const MAX_TOTAL_CONCURRENCY = 2;
export const MAX_QUEUE_DEPTH = 50;
```

Delete: `STRUCTURED_CONCURRENCY`, `IDEATION_POOL_SIZE`, `UNIQUE_THEME_TARGET`, `SIMILARITY_THRESHOLD`, `SCRIPTS_PER_THEME`, `VISUAL_PROMPT_CHUNK`, `SCENE_CHUNK_SIZE`.

### 8.8 Clean queue.ts

- [ ] **Step 1: Simplify `app/lib/queue.ts`**

Delete `JobType` import. Replace `detectJobType` and remove the `job_type` branching from `dequeueJob`. Keep the queue functions but treat all jobs as one type:

In `app/lib/queue.ts`, delete `detectJobType` function and remove `job_type: detectJobType(payload)` from `enqueueJob` insertOne call:

```ts
const result = await db.collection('JobQueue').insertOne({
  generation_id: generationId,
  payload,
  status: 'pending',
  attempts: 0,
  max_attempts: 3,
  worker_id: null,
  scheduled_at: new Date(),
  created_at: new Date(),
});
```

Simplify `dequeueJob` signature to drop `jobType` parameter:

```ts
export async function dequeueJob(workerId?: string): Promise<Job | null> {
  const db = await getDb();
  const now = new Date();
  const filter = {
    status: 'pending',
    scheduled_at: { $lte: now },
    $expr: { $lt: ['$attempts', '$max_attempts'] },
  };
  // ... rest unchanged
}
```

Same for `getPendingJobCount` — drop `jobType` parameter. Update the `Job` interface — drop `job_type` field.

Update worker code that calls these to remove the `jobType` argument.

### 8.9 Clean types.ts

- [ ] **Step 1: Edit `app/lib/types.ts`**

Delete these types:

- `JobType`
- `SceneType`
- `Scene`
- `Variation`
- `GenerationResponse`
- `GenerationRequest`
- `EnhancedGenerationRequest`
- `GenerationJobPayload`
- `DBScript`
- `DBScene`
- `SceneAssetState`

Keep: `ProductDescription`, `ModelDescription`, `DBGeneration`, `Clip`, `ClipImageMode`, `Idea`, `AssetStatus`.

### 8.10 Migration Script

- [ ] **Step 1: Create script**

```bash
mkdir -p scripts
```

Write `scripts/migrate-drop-legacy.ts`:

```ts
import { getDb } from '../app/lib/mongoClient';

async function migrate() {
  console.log('=== Studio Clean Flow Migration ===');
  const db = await getDb();

  const updateResult = await db.collection('Generations').updateMany(
    { clips: { $exists: false }, format_version: { $ne: 'legacy' } },
    { $set: { format_version: 'legacy' } }
  );
  console.log(`Marked ${updateResult.modifiedCount} generations as legacy`);

  for (const collName of ['Scripts', 'Scenes']) {
    try {
      await db.collection(collName).drop();
      console.log(`Dropped ${collName} collection`);
    } catch (err) {
      if ((err as { codeName?: string }).codeName === 'NamespaceNotFound') {
        console.log(`${collName} collection already absent`);
      } else {
        throw err;
      }
    }
  }

  await db.collection('Generations').createIndex({ format_version: 1 });
  console.log('Created format_version index on Generations');

  console.log('=== Migration done ===');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
```

- [ ] **Step 2: Run migration**

```bash
npx tsx scripts/migrate-drop-legacy.ts
```

Expected output: marks legacy generations, drops Scripts + Scenes, creates index.

- [ ] **Step 3: Verify in MongoDB**

```bash
echo "show collections" | mongosh "$MONGODB_URI" --quiet
```
Expected: No `Scripts` or `Scenes`. `Generations` exists.

### 8.11 Verify Build & Commit Chunk 8

- [ ] **Step 1: Final build check**

```bash
npm run build
```
Expected: No TypeScript errors.

- [ ] **Step 2: Lint check**

```bash
npm run lint 2>&1 | tail -20
```

Fix any blockers.

- [ ] **Step 3: Atomic commit**

```bash
git add -A
git commit -m "refactor: swap studio-v2 → studio, delete legacy code & DB collections

- Rename app/studio-v2/ → app/studio/
- Delete old API routes (analyze-images, generate-creative-ideas, generate-enhanced, generate-directors-script)
- Delete old components (ResultsDisplay, SceneAssetPanel, InputForm, JobStatus if unused)
- Delete v1 LLM functions (visionDescribeProduct/Model, ideation50, script5, enrichVisualPrompts, genericModelDescribe)
- Delete v1 prompts and layer names (embedding, scripting, visualPrompt, ideation)
- Delete v1 worker logic (now throws if non-v2 payload received)
- Clean workerConfig (drop unused concurrency/pipeline constants)
- Simplify queue.ts (drop JobType branching)
- Clean types.ts (drop SceneType, Scene, Variation, etc)
- Run migration: drop Scripts + Scenes collections, mark legacy generations"
```

---

## Chunk 9 — Production Manual Test

- [ ] **Step 1: Restart dev server + worker**

```bash
# Kill existing processes
# Terminal 1:
npm run dev
# Terminal 2:
npm run worker
```

- [ ] **Step 2: Browse to `http://localhost:3000/studio`**

Verify the new flow renders (NOT old form). Run happy path:

- Upload foto produk + foto model + brief
- Generate Ide → 3-5 ide muncul
- Pilih ide → Style Notes + 4 clip textareas auto-filled
- Buat Video → redirect to detail page
- Wait for all clips to complete (5-10 min)

- [ ] **Step 3: Edge case verification**

| Test | Expected |
|---|---|
| No foto model | Ides still generate, modelAnalysis null or persona suggestion |
| Empty brief | Ides generate, less specific but works |
| Override foto clip 2 | Clip 2 video uses uploaded photo |
| AI mode clip 3 | Image generates first, then video |
| Add clip 5 (dynamic) | 5-clip video output |
| Regenerate clip 2 | Only clip 2 re-runs |
| Open legacy generation in /history | LegacyFallback renders with Hapus button |
| Hapus legacy → confirm | Deleted from /history |

- [ ] **Step 4: Lint & build final**

```bash
npm run build && npm run lint
```

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final manual test fixes" || true
```

---

## Chunk 10 — PR & Merge

- [ ] **Step 1: Push branch**

```bash
git push -u origin feature/studio-clean-flow
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "Studio Clean Flow — 3-step refactor" --body "$(cat <<'EOF'
## Summary
- Refactor "Dari Nol" pipeline jadi 3-step user-facing: Input → Pilih Ide → Edit Clips
- Replace Hook/Problem/Solution/CTA splitting dengan single-text per clip (8s/clip)
- 3 LLM calls (Vision multimodal + Ideation + Expand) menggantikan 5+ calls flow lama
- Veo 3.1 fast image-to-video dengan 3 imageMode (inherit/override/ai-generate)
- Drop Scripts & Scenes collections; clips[] embedded di Generations doc
- Generations lama di-tag 'legacy', UI fallback dengan tombol Hapus

## Implementation Approach
Opsi C — Parallel namespace + atomic cleanup:
1. Build v2 di `/studio-v2` parallel selama Chunks 1-7
2. Smoke test v2 standalone (Chunk 7)
3. Atomic swap + cleanup (Chunk 8): rename folder, delete deadcode, drop legacy collections
4. Final test (Chunks 9-10)

## Spec & Plan
- Spec: [docs/superpowers/specs/2026-04-29-studio-clean-flow-design.md](docs/superpowers/specs/2026-04-29-studio-clean-flow-design.md)
- Plan: [docs/superpowers/plans/2026-04-29-studio-clean-flow.md](docs/superpowers/plans/2026-04-29-studio-clean-flow.md)

## Test plan
- [x] Smoke test v2 standalone (Chunk 7)
- [x] Atomic swap commit (Chunk 8)
- [x] Production manual test (Chunk 9): happy path, edge cases, legacy fallback
- [x] Production build pass
- [x] MongoDB migration ran (Scripts/Scenes dropped, format_version index added)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Return PR URL**

PR is ready for review.

---

## Plan Complete

**Total chunks: 10** (vs 32 surgical tasks in earlier draft).

**Per-chunk effort estimate:**
- Chunks 1-2: ~30-45 min (LLM foundation + APIs)
- Chunks 3-5: ~45-60 min (worker + UI components + studio page)
- Chunk 6: ~20-30 min (detail page + history badge)
- Chunk 7: ~30-45 min (smoke test + bug fixes)
- Chunk 8: ~45-60 min (atomic cleanup + migration)
- Chunks 9-10: ~30 min (final test + PR)

**Total: ~4-6 hours** for an experienced engineer.

**Rollback strategy:** Each chunk is a granular commit. Revert specific chunks via `git revert <sha>`. For DB rollback, restore `backup-*/` from Chunk 0.
