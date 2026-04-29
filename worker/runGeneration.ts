import pLimit from 'p-limit';
import { z } from 'zod';
import { getDb } from '../app/lib/mongoClient';
import { ObjectId } from 'mongodb';
import { GenerationRequest, EnhancedGenerationRequest, ProductDescription, ModelDescription } from '../app/lib/types';
import { stableHash } from '../app/lib/utils';
import * as llm from '../app/lib/llm';
import { chatCompletion } from '../app/lib/llm/client';
import { parseJson } from '../app/lib/llm/middleware';
import { resolvePreset, type ModelConfig } from '../app/lib/llm';
import {
  IDEATION_POOL_SIZE,
  UNIQUE_THEME_TARGET,
  SIMILARITY_THRESHOLD,
  VISUAL_PROMPT_CHUNK,
  SCENE_CHUNK_SIZE,
} from '../app/lib/workerConfig';

// p-limit concurrency for parallel LLM calls within a single generation
const limit = pLimit(8);

// Schema validation
const SceneSchema = z.object({
  struktur: z.enum(['Hook', 'Problem', 'Solution', 'CTA']),
  naskah_vo: z.string(),
  visual_idea: z.string(),
  text_to_image: z.string().optional(),
  image_to_video: z.string().optional(),
}).strict();

const ScriptSchema = z.object({
  id: z.string(),
  theme: z.string(),
  scenes: z.array(SceneSchema).min(3).max(4),
}).strict();

interface ThemeWithVector {
  text: string;
  vector: number[];
}

async function updateGen(genId: string, updates: Record<string, unknown>) {
  const statusMap: Record<string, string> = {
    'running': 'processing',
    'succeeded': 'completed',
    'failed': 'failed',
  };
  if (updates.status && statusMap[updates.status as string]) {
    updates.status = statusMap[updates.status as string];
  }
  const db = await getDb();
  await db.collection('Generations').updateOne(
    { _id: new ObjectId(genId) },
    { $set: { ...updates, updated_at: new Date() } }
  );
}

async function ensureProductModel(
  productId: string,
  product: ProductDescription,
  modelId: string,
  model: ModelDescription | null
) {
  const db = await getDb();
  
  // Save Product
  await db.collection('Products').updateOne(
    { product_identifier: productId },
    { $set: { product_identifier: productId, description: product, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
    { upsert: true }
  );

  // Save Model
  if (modelId && model) {
    await db.collection('Models').updateOne(
      { model_identifier: modelId },
      { 
        $set: { 
          model_identifier: modelId, 
          description: model, 
          source: model.source || 'vision',
          updated_at: new Date() 
        }, 
        $setOnInsert: { created_at: new Date() } 
      },
      { upsert: true }
    );
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}. Check that the same embedding model is used for all vectors.`);
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function pickUniqueThemes(params: {
  vectors: ThemeWithVector[];
  productId: string;
  desired: number;
}): Promise<ThemeWithVector[]> {
  const { vectors, productId, desired } = params;
  const unique: ThemeWithVector[] = [];

  for (const candidate of vectors) {
    let tooSimilar = false;
    for (const existing of unique) {
      const similarity = cosineSimilarity(candidate.vector, existing.vector);
      if (similarity > SIMILARITY_THRESHOLD) {
        tooSimilar = true;
        break;
      }
    }

    if (!tooSimilar) {
      unique.push(candidate);
      if (unique.length >= desired) break;
    }
  }

  return unique.slice(0, desired);
}

async function insertIdeas(genId: string, themes: ThemeWithVector[]) {
  const db = await getDb();

  // Idempotency: wipe any partial data from a previous failed attempt
  await db.collection('Ideas').deleteMany({ generation_id: genId });

  const rows = themes.map((t) => ({
    generation_id: genId,
    idea_text: t.text,
    embedding: t.vector,
    created_at: new Date(),
  }));

  const result = await db.collection('Ideas').insertMany(rows);
  if (result.insertedCount === 0) throw new Error('Failed to insert ideas');
  return result.insertedCount;
}

async function persistScriptsAndScenes(genId: string, scripts: unknown[]) {
  const db = await getDb();

  // Idempotency: remove any partial data from a previous failed attempt
  const existingScripts = await db.collection('Scripts').find({ generation_id: genId }, { projection: { _id: 1 } }).toArray();
  if (existingScripts.length > 0) {
    const existingIds = existingScripts.map((s) => s._id.toString());
    await db.collection('Scenes').deleteMany({ script_id: { $in: existingIds } });
    await db.collection('Scripts').deleteMany({ generation_id: genId });
  }

  const ideas = await db.collection('Ideas')
    .find({ generation_id: genId })
    .sort({ created_at: 1 })
    .project({ _id: 1 })
    .toArray();

  if (ideas.length === 0) {
    throw new Error(`No ideas found for generation ${genId.slice(0, 8)} — cannot persist scripts`);
  }

  // Map scripts to ideas (cycle through ideas if more scripts than ideas)
  const scriptInserts = (scripts as Array<{ theme: string }>).map((script, i) => ({
    generation_id: genId,
    idea_id: ideas[i % ideas.length]._id.toString(),
    theme: script.theme,
    idx: i + 1,
    created_at: new Date(),
  }));

  const scriptsRes = await db.collection('Scripts').insertMany(scriptInserts);
  const scriptRows = scriptInserts.map((_, i) => ({
    id: Object.values(scriptsRes.insertedIds)[i].toString(),
    idx: i + 1,
  }));

  type ScriptWithScenes = { theme: string; scenes: Array<Record<string, unknown>> };
  const sceneInserts: Array<Record<string, unknown>> = [];
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i] as ScriptWithScenes;
    const scriptRow = scriptRows[i];
    for (let j = 0; j < script.scenes.length; j++) {
      const scene = script.scenes[j];
      sceneInserts.push({
        script_id: scriptRow.id,
        order: j + 1,
        struktur: scene.struktur,
        naskah_vo: scene.naskah_vo,
        visual_idea: scene.visual_idea,
        text_to_image: scene.text_to_image ?? null,
        image_to_video: scene.image_to_video ?? null,
        image_status: 'pending',
        video_status: 'pending',
        image_source: null,
        image_error: null,
        video_error: null,
        created_at: new Date(),
      });
    }
  }

  for (let i = 0; i < sceneInserts.length; i += SCENE_CHUNK_SIZE) {
    await db.collection('Scenes').insertMany(sceneInserts.slice(i, i + SCENE_CHUNK_SIZE));
  }
}

// ─── Enhanced flow (structured payload from UI) ──────────────────────────────

async function processStructuredPayload(
  genId: string,
  payload: import('../app/lib/types').GenerationJobPayload,
  modelConfig: ModelConfig
) {

  const count = payload.storyboardCount ?? 5;
  const product = payload.product ?? {};
  const model = payload.model ?? null;
  const creativeIdea = payload.creativeIdea;

  await updateGen(genId, { progress: 10, progress_label: 'Menyiapkan konteks...' });

  // Build scripting context from structured data
  const productCtx = `Brand: ${product.brand ?? '-'}, Category: ${product.category ?? '-'}, Benefit: ${product.key_benefit ?? '-'}, Target: ${product.target_audience ?? '-'}`;
  const modelCtx = model
    ? `Model: ${(model as any).age_range ?? '-'}, ${(model as any).gender ?? '-'}, ${(model as any).ethnicity ?? '-'}`
    : 'No model image';
  const ideaCtx = creativeIdea
    ? `Title: ${creativeIdea.title}\nConcept: ${creativeIdea.concept}\nStoryline: ${creativeIdea.storyline}`
    : `Basic idea: ${payload.basicIdea}`;

  const systemPrompt = `Kamu adalah Sutradara Iklan dan Penulis Naskah profesional.
Buat ${count} variasi storyboard iklan video 30 detik berbeda namun konsisten dengan brand.
Setiap storyboard: Hook (0-6s) → Problem (6-12s) → Solution (12-24s) → CTA (24-30s).

Return JSON:
{
  "storyboards": [
    {
      "idx": 1,
      "theme": "judul tema (max 60 karakter)",
      "directors_script": "panduan shooting ringkas",
      "scenes": [
        {
          "struktur": "Hook",
          "naskah_vo": "teks voiceover bahasa Indonesia",
          "visual_idea": "deskripsi visual",
          "text_to_image": "prompt AI image generation detail",
          "image_to_video": "deskripsi gerakan per detik"
        }
      ]
    }
  ]
}`;

  const userPrompt = `PRODUK: ${productCtx}
${modelCtx}

IDE KREATIF TERPILIH:
${ideaCtx}

Buat ${count} storyboard yang beragam tapi konsisten dengan brand dan ide di atas.`;

  const { chatCompletion: cc } = await import('../app/lib/llm/client');
  const { parseJson: pj } = await import('../app/lib/llm/middleware');

  const res = await cc({
    model: modelConfig.scripting,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: count > 10 ? 16000 : 12000,
    response_format: { type: 'json_object' },
  });

  const parsed = pj<{ storyboards: Storyboard[] }>(res.choices[0]?.message?.content ?? '');
  const storyboards: Storyboard[] = parsed.storyboards ?? [];

  if (storyboards.length === 0) throw new Error('No storyboards generated');

  await updateGen(genId, { progress: 60, progress_label: `Menyimpan ${storyboards.length} storyboard...` });
  await persistStructuredStoryboards(genId, storyboards);
  await updateGen(genId, { status: 'completed', progress: 100, progress_label: 'Selesai' });
}

// ─── Old enhanced flow (kept for backward compat with old queue jobs) ─────────

async function processWithEnhancedPrompt(genId: string, payload: EnhancedGenerationRequest) {
  try {
    const count = payload.storyboardCount || 5;
    const storyboards = await generateStoryboardsFromEnhancedPrompt(payload.enhancedPrompt!, payload, count);
    await updateGen(genId, { progress: 50 });
    await persistStructuredStoryboards(genId, storyboards);
    await updateGen(genId, { progress: 100, status: 'completed' });
  } catch (error) {
    await updateGen(genId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Interface for structured storyboard
interface StoryboardScene {
  struktur: 'Hook' | 'Problem' | 'Solution' | 'CTA';
  naskah_vo: string;
  visual_idea: string;
  text_to_image?: string;
  image_to_video?: string;
}

interface Storyboard {
  idx: number;
  theme: string;
  directors_script: string;
  scenes: StoryboardScene[];
}

/**
 * Generate structured storyboards from enhanced prompt
 */
async function generateStoryboardsFromEnhancedPrompt(enhancedPrompt: string, payload: EnhancedGenerationRequest, count: number = 5): Promise<Storyboard[]> {

  const systemPrompt = `You are an Award-Winning Commercial Director and Screenwriter (Sutradara & Penulis Naskah).

Your goal is to turn a creative concept into a precise, professional 30-SECOND VIDEO COMMERCIAL SCRIPT.
You must adopt three specific sub-roles to ensure professional consistency:

1. **The Visual Director**: You decide the camera angles, lighting, and color grading.
2. **The Screenwriter**: You write natural, persuasive dialogue and voiceovers.
3. **The Editor**: You ensure the pacing fits exactly into a 30-second timeline.

Your task is to create ${count} different but consistent storyboard themes based on the enhanced prompt provided. Each storyboard must follow this EXACT structure:

HOOK (0-6s) → PROBLEM/SETUP (6-12s) → SOLUTION/PRODUCT (12-24s) → CTA/PAYOFF (24-30s)

REQUIREMENTS:
- Each storyboard = 4 connected scenes covering exactly 30 seconds total.
- Scenes must flow logically: Hook introduces → Problem builds tension → Solution provides relief → CTA drives action
- All storyboards must align with the product, brand, and target audience from the enhanced prompt
- Create VARIETY: Different angles, scenarios, emotions, and approaches while staying brand-consistent
- Include DETAILED voice over scripts for each scene
- Provide SPECIFIC visual prompts for text-to-image and image-to-video generation
- Include a "directors_script" field for each storyboard containing a detailed shooting script (Location, Character, Props, Timeline 0-30s breakdown)

Return a JSON object with a single property called "storyboards" containing an array of exactly ${count} storyboards:

{
  "storyboards": [
    {
      "idx": 1,
      "theme": "Theme title (max 60 chars)",
      "directors_script": "[LOKASI]: ...\n[KARAKTER]: ...\n[PROPERTI]: ...\n\n**TIMELINE (0-30s)**\n0-2s\n...",
      "scenes": [
        {
          "struktur": "Hook",
          "naskah_vo": "Voice over script for 0-6s",
          "visual_idea": "Visual description",
          "text_to_image": "Detailed prompt",
          "image_to_video": "Motion prompt"
        }
      ]
    }
  ]
}`;

  const userPrompt = `ENHANCED PROMPT/CREATIVE BRIEF:
${enhancedPrompt}

Create ${count} different storyboard themes that follow the Hook-Problem-Solution-CTA structure. Each storyboard must be unique but consistent with the brand and product described in the enhanced prompt above.

CRITICAL VISUAL CONSISTENCY & DIRECTOR'S RULES:
1. **VISUAL ANCHORS**: Select 3-5 visual keywords (e.g., "Golden cap", "Blue bottle", "Model's red lips") that MUST appear in EVERY single second description to force the AI to maintain them.
2. **MICRO-MOVEMENTS**: For "image_to_video" and timeline descriptions, prefer subtle, realistic movements (e.g., "gentle breathing", "subtle smile", "slow product rotation") over complex actions to prevent "face morphing" or hallucinations.
3. **STRICT SOURCE FIDELITY**: Since we use Image-to-Video with a source image, do NOT over-describe the product's look in the motion prompts. Focus on ACTION and MOVEMENT.
4. **PRODUCT CONSISTENCY**: The product must look IDENTICAL in every single frame/second.

For the "directors_script" field, follow this exact format:
[LOKASI]: Detailed description of the setting/background.
[KARAKTER]: Detailed description of the actor/model (age, look, outfit).
[PROPERTI]: Detailed list of props.

**TIMELINE (0-30s)**

0-3s (Hook)
wanita: ...
kamera: ...
aksi/dialog: ...
product: ...

3-6s (Hook/Intro)
wanita: ...
kamera: ...
aksi/dialog: ...
product: ...

6-9s (Problem)
wanita: ...
kamera: ...
aksi/dialog: ...
product: ...

9-12s (Problem/Agitation)
wanita: ...
kamera: ...
aksi/dialog: ...
product: ...

12-15s (Solution)
wanita: ...
kamera: ...
aksi/dialog: ...
product: ...

15-18s (Benefit)
wanita: ...
kamera: ...
aksi/dialog: ...
product: ...

18-21s (Benefit)
wanita: ...
kamera: ...
aksi/dialog: ...
product: ...

21-24s (Result)
wanita: ...
kamera: ...
aksi/dialog: ...
product: ...

24-27s (CTA)
wanita: ...
kamera: ...
aksi/dialog: ...
product: ...

27-30s (CTA/Final)
wanita: ...
kamera: ...
aksi/dialog: ...
product: ...
`;

  try {
    const modelConfig = resolvePreset('balanced');
    const res = await chatCompletion({
      model: modelConfig.scripting,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: count > 20 ? 16000 : 12000,
      response_format: { type: 'json_object' },
    });

    const content = res.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM for storyboard generation');
    }

    let parsed: { storyboards?: unknown };
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      throw new Error(`Failed to parse LLM response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    const storyboards = parsed.storyboards;
    if (!Array.isArray(storyboards)) {
      throw new Error(`Expected storyboards array, got ${typeof storyboards}`);
    }

    return storyboards as Storyboard[];
  } catch (error) {
    throw new Error(`Storyboard generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function persistStructuredStoryboards(genId: string, storyboards: Storyboard[]) {
  const db = await getDb();

  // Idempotency: remove partial data from any previous failed attempt
  const existingScripts = await db.collection('Scripts').find({ generation_id: genId }, { projection: { _id: 1 } }).toArray();
  if (existingScripts.length > 0) {
    const existingIds = existingScripts.map((s) => s._id.toString());
    await db.collection('Scenes').deleteMany({ script_id: { $in: existingIds } });
    await db.collection('Scripts').deleteMany({ generation_id: genId });
  }
  await db.collection('Ideas').deleteMany({ generation_id: genId });

  // Insert ideas
  const ideaInserts = storyboards.map((sb) => ({
    generation_id: genId,
    idea_text: sb.theme,
    embedding: null,
    created_at: new Date(),
  }));
  const { insertedCount: ideaCount, insertedIds: ideaIds } = await db.collection('Ideas').insertMany(ideaInserts);
  if (ideaCount === 0) throw new Error('Failed to create ideas');
  const ideaIdList = Object.values(ideaIds).map((id) => id.toString());

  // Insert scripts
  const scriptInserts = storyboards.map((sb, i) => ({
    generation_id: genId,
    idea_id: ideaIdList[i],
    theme: sb.theme,
    idx: sb.idx,
    directors_script: sb.directors_script,
    created_at: new Date(),
  }));
  const scriptsRes = await db.collection('Scripts').insertMany(scriptInserts);
  const scriptIdList = Object.values(scriptsRes.insertedIds).map((id) => id.toString());

  // Insert scenes
  const sceneInserts: Array<Record<string, unknown>> = [];
  for (let i = 0; i < storyboards.length; i++) {
    for (let j = 0; j < storyboards[i].scenes.length; j++) {
      const scene = storyboards[i].scenes[j];
      sceneInserts.push({
        script_id: scriptIdList[i],
        order: j + 1,
        struktur: scene.struktur,
        naskah_vo: scene.naskah_vo,
        visual_idea: scene.visual_idea,
        text_to_image: scene.text_to_image ?? null,
        image_to_video: scene.image_to_video ?? null,
        image_status: 'pending',
        video_status: 'pending',
        image_source: null,
        image_error: null,
        video_error: null,
        created_at: new Date(),
      });
    }
  }

  for (let i = 0; i < sceneInserts.length; i += SCENE_CHUNK_SIZE) {
    await db.collection('Scenes').insertMany(sceneInserts.slice(i, i + SCENE_CHUNK_SIZE));
  }
}

export async function runGeneration(
  genId: string,
  payload: GenerationRequest | EnhancedGenerationRequest | import('../app/lib/types').GenerationJobPayload
) {

  try {
    await updateGen(genId, { status: 'processing', progress: 5, progress_label: 'Memulai proses...' });

    const db = await getDb();
    const genDoc = await db.collection('Generations').findOne(
      { _id: new ObjectId(genId) },
      { projection: { modelConfig: 1 } }
    );
    const modelConfig: ModelConfig = genDoc?.modelConfig ?? resolvePreset('balanced');

    // Structured payload from new UI flow (has creativeIdea field)
    if ('creativeIdea' in payload && payload.creativeIdea) {
      await processStructuredPayload(
        genId,
        payload as import('../app/lib/types').GenerationJobPayload,
        modelConfig
      );
      return;
    }

    // Legacy enhanced flow (old queue jobs with enhancedPrompt string)
    const isLegacyEnhanced = 'enhancedPrompt' in payload || (payload as GenerationRequest).productImageUrl === 'enhanced-flow';
    if (isLegacyEnhanced) {
      let enhancedPrompt = ('enhancedPrompt' in payload ? payload.enhancedPrompt : undefined) as string | undefined;
      if (!enhancedPrompt) {
        const gen = await db.collection('Generations').findOne(
          { _id: new ObjectId(genId) },
          { projection: { overrides: 1, product_image_url: 1, model_image_url: 1 } }
        );
        if (!gen?.overrides) throw new Error('Enhanced prompt not found in database');
        enhancedPrompt = gen.overrides;
        (payload as GenerationRequest).productImageUrl = gen.product_image_url || (payload as GenerationRequest).productImageUrl;
        if (gen.model_image_url) payload.modelImageUrl = gen.model_image_url;
      }
      await processWithEnhancedPrompt(genId, { ...payload, enhancedPrompt } as EnhancedGenerationRequest);
      return;
    }

    // Standard flow — payload is GenerationRequest from here on
    const stdPayload = payload as GenerationRequest;

    if (!stdPayload.productImageUrl?.trim()) {
      throw new Error('Product image URL is required');
    }

    // Convert product image to base64 for reliability
    let productImageInput: string;
    try {
      const { imageUrlToBase64 } = await import('./imageOptimizer');
      productImageInput = await imageUrlToBase64(stdPayload.productImageUrl);
      if (productImageInput.startsWith('data:image/')) {
        const base64Data = productImageInput.split(',')[1];
        if (!base64Data || base64Data.length < 100) throw new Error('Base64 data too short');
      }
    } catch {
      productImageInput = stdPayload.productImageUrl; // fallback to URL
    }

    let product: ProductDescription;
    let productId: string;
    let model: ModelDescription | null = null;
    let modelId: string = '';

    // Prepare analysis tasks
    const analysisTasks: Array<() => Promise<ProductDescription | ModelDescription>> = [];

    // Product analysis task with caching
    analysisTasks.push(async () => {
      const productCacheKey = stableHash(productImageInput + (stdPayload.visualOverrides ?? ''));
      try {
        const db = await getDb();
        const cached = await db.collection('Products').findOne({ product_identifier: productCacheKey }, { projection: { description: 1 } });
        if (cached?.description) return cached.description as ProductDescription;
      } catch { /* cache miss, proceed */ }

      const result = await llm.visionDescribeProduct(
        productImageInput,
        stdPayload.basicIdea,
        stdPayload.visualOverrides || undefined,
        modelConfig,
        genId
      );
      if (!result || typeof result !== 'object') throw new Error('Invalid product description from LLM');
      return result;
    });

    // Model analysis task (if model image exists)
    if (payload.modelImageUrl) {
      const modelImageUrl = payload.modelImageUrl;
      analysisTasks.push(async () => {
        let modelImageInput: string;
        try {
          const { imageUrlToBase64 } = await import('./imageOptimizer');
          modelImageInput = await imageUrlToBase64(modelImageUrl);
        } catch {
          modelImageInput = modelImageUrl;
        }
        const result = await llm.visionDescribeModel(modelImageInput, modelConfig, genId);
        if (!result || typeof result !== 'object') throw new Error('Invalid model description from LLM');
        return result;
      });
    }

    const results = await Promise.all(analysisTasks.map((task) => task()));
    product = results[0] as ProductDescription;
    productId = stableHash(productImageInput + (stdPayload.visualOverrides ?? ''));
    if (results.length > 1) {
      model = results[1] as ModelDescription;
      modelId = payload.modelImageUrl ? stableHash(payload.modelImageUrl) : stableHash(JSON.stringify(model));
    }

    if (!model) {
      model = await llm.genericModelDescribe(stdPayload.basicIdea, modelConfig, genId);
      modelId = stableHash(JSON.stringify(model));
    }

    await ensureProductModel(productId, product, modelId, model);
    await updateGen(genId, {
      product_identifier: productId,
      model_identifier: modelId,
      progress: 10,
      progress_label: 'Menganalisis produk & model...',
    });

    const potentialIdeas = await llm.ideation50(product, stdPayload.basicIdea, modelConfig, genId);

    const vectors = await llm.embedBatch(potentialIdeas.slice(0, IDEATION_POOL_SIZE), IDEATION_POOL_SIZE, modelConfig, genId);
    const themesWithVectors: ThemeWithVector[] = potentialIdeas
      .slice(0, 50)
      .map((text, i) => ({ text, vector: vectors[i] }));

    const uniqueThemes = await pickUniqueThemes({ vectors: themesWithVectors, productId, desired: UNIQUE_THEME_TARGET });
    const insertedCount = await insertIdeas(genId, uniqueThemes);
    if (insertedCount === 0) throw new Error('No ideas inserted — cannot proceed with script generation');
    await updateGen(genId, { progress: 35, progress_label: `Memilih ${uniqueThemes.length} tema unik...` });

    // L3: Script Generation (20 themes × 5 scripts = 100)
    // Use allSettled so a single theme failure doesn't kill the whole generation
    const scriptResults = await Promise.allSettled(
      uniqueThemes.map((theme) => limit(() => llm.script5(theme.text, modelConfig, genId)))
    );

    let scripts100 = scriptResults
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .filter((s) => {
        try { ScriptSchema.parse(s); return true; } catch { return false; }
      });

    if (scripts100.length === 0) {
      throw new Error('All script generation attempts failed — no valid scripts produced');
    }
    if (scripts100.length > 100) scripts100 = scripts100.slice(0, 100);

    await updateGen(genId, { progress: 75, progress_label: `Menulis ${scripts100.length} script...` });

    // L5: Visual Prompt Enrichment in chunks
    const CHUNK_SIZE = VISUAL_PROMPT_CHUNK;
    const chunks: unknown[][] = [];
    for (let i = 0; i < scripts100.length; i += CHUNK_SIZE) chunks.push(scripts100.slice(i, i + CHUNK_SIZE));

    const final: unknown[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const enrichedChunk = await llm.enrichVisualPrompts(product, model, stdPayload.visualOverrides || '', chunks[i], modelConfig, genId);
      final.push(...enrichedChunk);
      const progress = 75 + Math.round(((i + 1) / chunks.length) * 20);
      await updateGen(genId, { progress, progress_label: `Membuat visual prompt (${i + 1}/${chunks.length})...` });
    }

    await persistScriptsAndScenes(genId, final);

    // Scripts & visual prompts complete — images/videos are triggered manually from the UI
    await updateGen(genId, { status: 'completed', progress: 100, progress_label: 'Selesai' });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    // Do not reset progress to 0 — preserve how far we got for debugging
    await updateGen(genId, {
      status: 'failed',
      error_message: errorMessage,
    });
    throw e;
  }
}
