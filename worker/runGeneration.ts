import pLimit from 'p-limit';
import { z } from 'zod';
import { getDb } from '../app/lib/mongoClient';
import { ObjectId } from 'mongodb';
import { GenerationRequest, EnhancedGenerationRequest, ProductDescription, ModelDescription } from '../app/lib/types';
import { stableHash } from '../app/lib/utils';
import * as openai from '../app/lib/adapters/openai';
import OpenAI from 'openai';

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
import * as gemini from '../app/lib/adapters/gemini';

  const limit = pLimit(8); // Increased concurrency for better performance

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

async function updateGen(genId: string, updates: any) {
  // Map status values to match database schema
  const statusMap: Record<string, string> = {
    'running': 'processing',
    'succeeded': 'completed',
    'failed': 'failed',
  };
  
  if (updates.status && statusMap[updates.status]) {
    updates.status = statusMap[updates.status];
  }
  
  // Handle error_message field (database uses error_message, not error)
  if (updates.error && !updates.error_message) {
    updates.error_message = updates.error;
    delete updates.error;
  }
  
  const db = await getDb();
  await db.collection('Generations').updateOne(
    { _id: new ObjectId(genId) },
    { $set: { ...updates, updated_at: new Date() } }
  );

  // Updated via MongoDB driver; errors will be thrown on failure
  
  console.log(`✅ Updated generation ${genId.substring(0, 8)}: ${JSON.stringify(updates)}`);
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
  
  // Simplified: Just check intra-batch similarity
  // RPC function match_ideas might not exist yet, so skip DB check for now
  for (const candidate of vectors) {
    // Check intra-batch similarity
    let tooSimilar = false;
    for (const existing of unique) {
      const similarity = cosineSimilarity(candidate.vector, existing.vector);
      if (similarity > 0.96) {
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
  console.log(`💾 Inserting ${themes.length} ideas for generation ${genId.substring(0, 8)}...`);
  
  // pgvector needs array format - Supabase automatically converts array to vector type
  const rows = themes.map((t) => ({
    generation_id: genId,
    idea_text: t.text,
    embedding: t.vector, // Pass as array, Supabase will convert to vector type
  }));

  console.log(`   First idea preview: "${themes[0]?.text?.substring(0, 60)}..."`);
  console.log(`   First embedding length: ${themes[0]?.vector?.length || 0}`);

  const db = await getDb();
  const result = await db.collection('Ideas').insertMany(rows.map((r) => ({ ...r, created_at: new Date() })));
  const insertedCount = result.insertedCount;
  if (insertedCount === 0) {
    throw new Error('Failed to insert ideas');
  }
  const verifyCount = await db.collection('Ideas').countDocuments({ generation_id: genId });
  console.log(`✅ Inserted ${insertedCount} ideas successfully`);
  return verifyCount;
}

async function persistScriptsAndScenes(genId: string, scripts: any[]) {
  console.log(`💾 Persisting ${scripts.length} scripts and scenes...`);
  console.log(`   Looking for ideas with generation_id: ${genId}`);
  
  // First, get idea_ids for this generation (we need to link scripts to ideas)
  let ideas;
  let retries = 3;
  
  while (retries > 0) {
    const db = await getDb();
    const data = await db.collection('Ideas')
      .find({ generation_id: genId })
      .sort({ created_at: 1 })
      .toArray();
    ideas = data.map((d) => ({ id: d._id.toString(), idea_text: d.idea_text, created_at: d.created_at }));
    break;
  }

  if (!ideas || ideas.length === 0) {
    console.error('❌ No ideas found for generation. Cannot persist scripts.');
    console.error(`   Generation ID: ${genId}`);
    
    const totalIdeas = await (await getDb()).collection('Ideas').countDocuments({});
    console.log(`   Total ideas in database: ${totalIdeas}`);
    
    throw new Error(`No ideas found for generation ${genId.substring(0, 8)}. Ideas may not have been inserted correctly.`);
  }

  console.log(`✅ Found ${ideas.length} ideas for this generation`);

  // Insert scripts and scenes
  // OPTIMIZED BATCH INSERTS - Major Performance Improvement
  console.log(`💾 Batch persisting ${scripts.length} scripts and scenes...`);

  // Prepare all script inserts
  const scriptInserts = scripts.map((script, i) => {
    // Find matching idea by theme (first 20 scripts map to 20 ideas, then cycle)
    const ideaIndex = i % Math.min(ideas.length, 20);
    const ideaId = ideas[ideaIndex]?.id;

    if (!ideaId) {
      console.error(`❌ No idea found for script ${i + 1}`);
      return null;
    }

    return {
      generation_id: genId,
      idea_id: ideaId,
      theme: script.theme,
      idx: i + 1,
    };
  }).filter(Boolean); // Remove null entries

  console.log(`   📦 Batch inserting ${scriptInserts.length} scripts...`);

  // Batch insert all scripts at once
  const db = await getDb();
  const scriptInsertDocs = scriptInserts.map((s) => ({ ...s, created_at: new Date() }));
  const scriptsRes = await db.collection('Scripts').insertMany(scriptInsertDocs);
  const scriptRows = scriptInsertDocs.map((doc, i) => ({ id: Object.values(scriptsRes.insertedIds)[i].toString(), idx: doc.idx }));

  console.log(`   ✅ Successfully batch inserted ${scriptRows.length} scripts`);

  // Prepare all scene inserts
  const sceneInserts = [];
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const scriptRow = scriptRows.find(sr => sr.idx === i + 1);

    if (!scriptRow) {
      console.error(`❌ Cannot find script row for idx ${i + 1}`);
      continue;
    }

    const scriptScenes = script.scenes.map((scene: any, sceneIdx: number) => ({
      script_id: scriptRow.id,
      order: sceneIdx + 1, // 1-indexed
      struktur: scene.struktur,
      naskah_vo: scene.naskah_vo,
      visual_idea: scene.visual_idea,
      text_to_image: scene.text_to_image || null,
      image_to_video: scene.image_to_video || null,
    }));

    sceneInserts.push(...scriptScenes);
  }

  console.log(`   📦 Batch inserting ${sceneInserts.length} scenes in chunks...`);

  // Batch insert scenes in chunks to avoid payload limits
  const SCENE_CHUNK_SIZE = 100;
  let totalInserted = 0;

  for (let i = 0; i < sceneInserts.length; i += SCENE_CHUNK_SIZE) {
    const chunk = sceneInserts.slice(i, i + SCENE_CHUNK_SIZE);
    const chunkDocs = chunk.map((c) => ({ ...c, created_at: new Date() }));
    await db.collection('Scenes').insertMany(chunkDocs);
    totalInserted += chunk.length;
  }

  console.log(`✅ Batch persisted ${scripts.length} scripts with ${totalInserted} scenes successfully`);
}

// Enhanced generation: Skip vision analysis, use provided enhanced prompt
async function processWithEnhancedPrompt(genId: string, payload: EnhancedGenerationRequest) {
  console.log('🔄 Processing with enhanced prompt...');

  try {
    // Direct Storyboard Generation (variable storyboards with H-P-S-CTA structure)
    const count = payload.storyboardCount || 5; // Default to 5 if not specified
    console.log(`🎬 Generating ${count} storyboards with Hook-Problem-Solution-CTA structure...`);

    const storyboards = await generateStoryboardsFromEnhancedPrompt(payload.enhancedPrompt!, payload, count);

    await updateGen(genId, { progress: 50 });
    console.log(`   ✅ Generated ${storyboards.length} storyboards with structured scenes`);

    // Process and persist storyboards
    await persistStructuredStoryboards(genId, storyboards);

    await updateGen(genId, { progress: 100, status: 'completed' });
    console.log('   ✅ Enhanced generation completed successfully');

  } catch (error) {
    console.error('   ❌ Enhanced generation failed:', error);
    await updateGen(genId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error)
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
  console.log(`🎬 Generating ${count} structured storyboards from enhanced prompt...`);

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
    // Retry logic for OpenAI API call
    let retries = 0;
    const maxRetries = 3;
    let response;

    while (retries < maxRetries) {
      try {
        console.log(`   🔄 Attempt ${retries + 1}/${maxRetries} to generate storyboards...`);
        
        response = await openaiClient.chat.completions.create({
          model: 'gpt-5.2',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.8,
          max_completion_tokens: count > 20 ? 16000 : 12000, // Optimize token limit based on count
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          // Success!
          break; 
        } else {
          console.warn(`   ⚠️ Attempt ${retries + 1} failed: Empty content from OpenAI`);
        }
      } catch (apiError) {
        console.error(`   ⚠️ Attempt ${retries + 1} failed with error:`, apiError);
        // Wait before retrying (exponential backoff: 2s, 4s, 8s)
        const delay = Math.pow(2, retries + 1) * 1000;
        console.log(`   ⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      retries++;
    }

    const content = response?.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`No response from GPT for storyboard generation after ${maxRetries} attempts`);
    }

    // Parse JSON response
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error(`   [Storyboard] JSON parse error:`, parseError);
      console.error(`   [Storyboard] Raw content:`, content.substring(0, 500));
      throw new Error(`Failed to parse GPT response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    console.log(`   [Storyboard] Parsed JSON object successfully`);

    // Extract storyboards array from response
    const storyboards = parsed.storyboards;
    if (!Array.isArray(storyboards)) {
      console.error(`   [Storyboard] storyboards property is not an array:`, typeof storyboards);
      throw new Error(`Expected storyboards to be an array, got ${typeof storyboards}`);
    }

    if (storyboards.length !== count) {
      console.warn(`   [Storyboard] Expected ${count} storyboards, got ${storyboards.length}`);
    }

    console.log(`✅ Successfully generated ${storyboards.length} structured storyboards`);
    return storyboards;

  } catch (error) {
    console.error('❌ Storyboard generation failed:', error);
    throw new Error(`Storyboard generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Persist structured storyboards to database
 */
async function persistStructuredStoryboards(genId: string, storyboards: Storyboard[]) {
  console.log('💾 Persisting structured storyboards to database...');

  const limit = pLimit(8); // Concurrency control

  try {
    // Create Ideas entries for each storyboard theme
    const ideaInserts = storyboards.map((storyboard, index) => ({
      generation_id: genId,
      idea_text: storyboard.theme,
      embedding: null, // Skip embedding for now
    }));

    const db = await getDb();
    const { insertedCount, insertedIds } = await db.collection('Ideas').insertMany(
      ideaInserts.map((d) => ({ ...d, created_at: new Date() }))
    );
    if (insertedCount === 0) {
      throw new Error(`Failed to create ideas`);
    }

    const ideas = await db.collection('Ideas')
      .find({ generation_id: genId })
      .project({ _id: 1, idea_text: 1 })
      .toArray();
    console.log(`✅ Created ${ideas.length} idea entries`);

    // Create Scripts and Scenes
    const scriptInserts = [];
    const sceneInserts = [];

    for (let i = 0; i < storyboards.length; i++) {
      const storyboard = storyboards[i];
      const idea = ideas[i];

      // Script entry
      scriptInserts.push({
        generation_id: genId,
        idea_id: idea._id.toString(),
        theme: storyboard.theme,
        idx: storyboard.idx,
        directors_script: storyboard.directors_script,
      });

      // Scene entries (4 scenes per storyboard)
      for (let j = 0; j < storyboard.scenes.length; j++) {
        const scene = storyboard.scenes[j];
        sceneInserts.push({
          script_id: `temp-${i}`, // Will be updated after script creation
          order: j + 1,
          struktur: scene.struktur,
          naskah_vo: scene.naskah_vo,
          visual_idea: scene.visual_idea,
          text_to_image: scene.text_to_image || null,
          image_to_video: scene.image_to_video || null,
        });
      }
    }

    // Insert scripts
    const scriptsRes = await db.collection('Scripts').insertMany(
      scriptInserts.map((d) => ({ ...d, created_at: new Date() }))
    );
    const scripts = scriptInserts.map((d, i) => ({ id: Object.values(scriptsRes.insertedIds)[i].toString(), idx: d.idx }));

    console.log(`✅ Created ${scripts.length} script entries`);

    // Update scene script_ids and insert scenes
    const updatedSceneInserts = sceneInserts.map((scene, index) => {
      const storyboardIndex = Math.floor(index / 4); // 4 scenes per storyboard
      const script = scripts[storyboardIndex];
      return {
        ...scene,
        script_id: script.id,
      };
    });

    // Insert scenes in batches
    const SCENE_BATCH_SIZE = 50;
    for (let i = 0; i < updatedSceneInserts.length; i += SCENE_BATCH_SIZE) {
      const batch = updatedSceneInserts.slice(i, i + SCENE_BATCH_SIZE);
      await db.collection('Scenes').insertMany(batch.map((b) => ({ ...b, created_at: new Date() })));
    }

    console.log(`✅ Created ${updatedSceneInserts.length} scene entries`);

    // Update generation progress
    await updateGen(genId, {
      progress: 75,
      status: 'processing'
    });

  } catch (error) {
    console.error('❌ Database persistence failed:', error);
    throw new Error(`Database persistence failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function runGeneration(genId: string, payload: GenerationRequest | EnhancedGenerationRequest) {
  console.log(`🚀 Starting generation ${genId.substring(0, 8)}...`);

  try {
    await updateGen(genId, { status: 'processing', progress: 5 });

    // Check if this is enhanced generation (skip vision analysis)
    const isEnhanced = 'enhancedPrompt' in payload || payload.productImageUrl === 'enhanced-flow';
    console.log(`   Mode: ${isEnhanced ? 'ENHANCED (skip vision analysis)' : 'STANDARD (full analysis)'}`);

    let enhancedPrompt: string | undefined;

    if (isEnhanced) {
      if ('enhancedPrompt' in payload) {
        // Enhanced prompt from payload
        enhancedPrompt = payload.enhancedPrompt;
        console.log('   📋 Using enhanced prompt from payload');
      } else {
        console.log('   📋 Enhanced flow detected, fetching prompt from database...');
        const db = await getDb();
        const gen = await db.collection('Generations').findOne({ _id: new ObjectId(genId) }, { projection: { overrides: 1 } });
        if (gen?.overrides) {
          enhancedPrompt = gen.overrides;
          console.log('   ✅ Enhanced prompt loaded from database');
        } else {
          throw new Error('Enhanced prompt not found in database');
        }
      }

      console.log(`   📝 Enhanced prompt length: ${enhancedPrompt!.length} chars`);

      // Process with enhanced prompt
      const enhancedPayload: EnhancedGenerationRequest = {
        ...payload,
        enhancedPrompt: enhancedPrompt!
      };
      await processWithEnhancedPrompt(genId, enhancedPayload);
      return;
    }

    // L0: Standard Vision Analysis
    console.log('L0: Vision analysis...');
    console.log(`   Product image URL: ${payload.productImageUrl?.substring(0, 80)}...`);
    
    // Validate image URL exists
    if (!payload.productImageUrl || payload.productImageUrl.trim() === '') {
      throw new Error('Product image URL is required');
    }
    
    // Convert to base64 for reliability (no timeout issues)
    let productImageInput: string;
    let isBase64Format = false;
    try {
      const { imageUrlToBase64 } = await import('./imageOptimizer');
      productImageInput = await imageUrlToBase64(payload.productImageUrl);
      isBase64Format = productImageInput.startsWith('data:image/');
      console.log(`   ✅ Image converted to base64 (more reliable)`);
      console.log(`   📊 Base64 format: ${isBase64Format ? 'YES' : 'NO'}`);
      console.log(`   📏 Base64 length: ${productImageInput.length} chars (${(productImageInput.length / 1024 / 1024).toFixed(2)} MB as base64)`);
      
      // Validate base64 format
      if (isBase64Format) {
        const base64Data = productImageInput.split(',')[1];
        if (!base64Data || base64Data.length < 100) {
          throw new Error('Base64 data seems too short or invalid');
        }
        console.log(`   ✅ Base64 validation passed (${base64Data.length} chars of data)`);
      }
    } catch (base64Error) {
      console.error('   ❌ Base64 conversion failed:', base64Error);
      console.error('   Error details:', base64Error instanceof Error ? base64Error.stack : String(base64Error));
      console.warn('   ⚠️  Falling back to URL (may have timeout issues)');
      productImageInput = payload.productImageUrl;
      isBase64Format = false;
    }
    
    // L1: Parallel Vision Analysis (Product + Model) - MAJOR OPTIMIZATION
    console.log('L1: Parallel vision analysis (product + model simultaneously)...');

    let product: ProductDescription;
    let productId: string;
    let model: ModelDescription | null = null;
    let modelId: string = '';

    // Prepare analysis tasks
    const analysisTasks: Array<() => Promise<ProductDescription | ModelDescription>> = [];

    // Product analysis task with caching
    analysisTasks.push(async () => {
      // Create cache key for product analysis
      const productCacheKey = stableHash(productImageInput + (payload.visualOverrides ?? '') + (payload.engine || ''));
      console.log(`   🔄 Analyzing PRODUCT (cache key: ${productCacheKey.substring(0, 8)})...`);

      // Check cache first (Products table)
      try {
        const db = await getDb();
        const cachedProduct = await db.collection('Products').findOne({ product_identifier: productCacheKey }, { projection: { description: 1 } });
        if (cachedProduct?.description) {
          console.log('   ✅ Product analysis loaded from CACHE!');
          return cachedProduct.description as ProductDescription;
        }
      } catch {
      }

      console.log(`   💡 Context: basicIdea = "${payload.basicIdea?.substring(0, 100) || 'N/A'}..."`);
      if (payload.visualOverrides) {
        console.log(`   🎨 Context: visualOverrides = "${payload.visualOverrides.substring(0, 100)}..."`);
      }

      let result;
      if (payload.engine === 'gemini-2.5-flash') {
        result = await gemini.visionDescribeProductGemini(
          productImageInput,
          payload.basicIdea,
          payload.visualOverrides || undefined
        );
      } else {
        result = await openai.visionDescribeProduct(
          productImageInput,
          payload.basicIdea,
          payload.visualOverrides || undefined
        );
      }

      // Validate response
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid product description returned from OpenAI');
      }

      console.log('   ✅ Product analysis complete (new):');
      console.log(`      Brand: ${result.brand || 'N/A'}`);
      console.log(`      Form Factor: ${result.form_factor || 'N/A'}`);
      console.log(`      Category: ${result.category || 'N/A'}`);
      console.log(`      Key Benefit: ${result.key_benefit || 'N/A'}`);

      return result;
    });

    // Model analysis task (if model image exists)
    if (payload.modelImageUrl) {
      const modelImageUrl = payload.modelImageUrl;
      analysisTasks.push(async () => {
        console.log('   📸 Converting model image...');
        let modelImageInput: string;
        let isModelBase64 = false;

        try {
          const { imageUrlToBase64 } = await import('./imageOptimizer');
          modelImageInput = await imageUrlToBase64(modelImageUrl);
          isModelBase64 = modelImageInput.startsWith('data:image/');
          console.log(`   ✅ Model image converted to base64 (${isModelBase64 ? 'YES' : 'NO'})`);
        } catch (base64Error) {
          console.error('   ❌ Model base64 conversion failed:', base64Error);
          console.warn('   ⚠️  Falling back to URL');
          modelImageInput = modelImageUrl;
          isModelBase64 = false;
        }

        console.log(`   🔄 Analyzing MODEL (using ${isModelBase64 ? 'base64' : 'URL'})...`);

        let result;
        if (payload.engine === 'gemini-2.5-flash') {
          result = await gemini.visionDescribeModelGemini(modelImageInput);
        } else {
          result = await openai.visionDescribeModel(modelImageInput);
        }

        // Validate response
        if (!result || typeof result !== 'object') {
          throw new Error('Invalid model description returned from OpenAI');
        }

        console.log('   ✅ Model analysis complete:');
        console.log(`      Age Range: ${result.age_range || 'N/A'}`);
        console.log(`      Gender: ${result.gender || 'N/A'}`);
        console.log(`      Appearance: ${result.appearance?.substring(0, 60) || 'N/A'}...`);

        return result;
      });
    } else {
      console.log('   ℹ️  No model image provided - using generic model description');
    }

    try {
      // Execute all analysis tasks in parallel
      console.log(`   🚀 Executing ${analysisTasks.length} analysis task(s) in parallel...`);
      const startTime = Date.now();

      const results = await Promise.all(analysisTasks.map((task) => task()));

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(1);
      console.log(`   ⚡ Parallel analysis completed in ${duration}s!`);

      // Assign results
      product = results[0] as ProductDescription;
      // Use cache key as productId (already includes image + context)
      productId = stableHash(productImageInput + (payload.visualOverrides ?? ''));

      if (results.length > 1) {
        model = results[1] as ModelDescription;
        // Create model cache key based on image content
        const modelCacheKey = payload.modelImageUrl ? stableHash(payload.modelImageUrl) : stableHash(JSON.stringify(model));
        modelId = modelCacheKey;
      }

      console.log(`   📦 Product ID: ${productId.substring(0, 16)}...`);
      if (modelId) {
        console.log(`   👤 Model ID: ${modelId.substring(0, 16)}...`);
      }

    } catch (error) {
      console.error('   ❌ Vision analysis failed!');
      console.error('   Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('   Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('   Stack trace:', error.stack);
      }

      // Check if it's an OpenAI API error
      if (error && typeof error === 'object' && 'response' in error) {
        const apiError = error as any;
        console.error('   OpenAI API Error Details:');
        console.error('   Status:', apiError.response?.status);
        console.error('   Status Text:', apiError.response?.statusText);
        console.error('   Response:', JSON.stringify(apiError.response?.data, null, 2));
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vision analysis failed: ${errorMsg}`);
    }

    // Handle case where no model image was provided
    if (!model) {
      try {
        console.log('   🔄 Generating generic model description...');
        model = await openai.genericModelDescribe(payload.basicIdea);
        modelId = stableHash(JSON.stringify(model));
        console.log(`   👤 Generic Model ID: ${modelId.substring(0, 16)}...`);
      } catch (error) {
        console.error('   ❌ Generic model description failed:', error);
        throw error;
      }
    }


    try {
      await ensureProductModel(productId, product, modelId, model);
      console.log('   ✅ Product & Model saved to database');
    } catch (error) {
      console.error('   ❌ Failed to save product/model:', error);
      throw error;
    }

    try {
      await updateGen(genId, {
        product_identifier: productId,
        model_identifier: modelId,
        progress: 10,
      });
      console.log('   ✅ Generation updated to 10% with product/model IDs');
    } catch (error) {
      console.error('   ❌ Failed to update generation:', error);
      throw error;
    }

    // L1: Ideation (50 angles)
    console.log('L1: Ideation...');
    const potentialIdeas =
      payload.engine === 'gpt-5.2'
        ? await openai.ideation50(product, payload.basicIdea)
        : await gemini.ideation50Gemini(product, payload.basicIdea);

    // L2: Embed + Filter (adaptive uniqueness)
    console.log('L2: Embedding and filtering...');
    const vectors = await openai.embedBatch(potentialIdeas.slice(0, 50), 50); // Increased batch size
    const themesWithVectors: ThemeWithVector[] = potentialIdeas
      .slice(0, 50)
      .map((text, i) => ({ text, vector: vectors[i] }));

    const uniqueThemes = await pickUniqueThemes({
      vectors: themesWithVectors,
      productId,
      desired: 20,
    });

    const insertedCount = await insertIdeas(genId, uniqueThemes);
    if (insertedCount === 0) {
      throw new Error('No ideas were inserted. Cannot proceed with script generation.');
    }
    
    await updateGen(genId, { progress: 35 });
    console.log(`✅ Progress updated to 35% (${insertedCount} ideas inserted)`);
    console.log(`Selected ${uniqueThemes.length} unique themes`);

    // L3: Script Generation (20 themes × 5 scripts = 100)
    console.log('L3: Generating scripts...');
    const scriptPromises = uniqueThemes.map((theme) =>
      limit(async () => {
        if (payload.engine === 'gpt-5.2') {
          return await openai.script5(theme.text);
        } else {
          return await gemini.script5Gemini(theme.text);
        }
      })
    );

    const scriptBatches = await Promise.all(scriptPromises);
    let scripts100 = scriptBatches.flat();

    // Validate scripts
    scripts100 = scripts100.filter((s) => {
      try {
        ScriptSchema.parse(s);
        return true;
      } catch (e) {
        console.error('Invalid script schema:', e);
        return false;
      }
    });

    console.log(`Generated ${scripts100.length} valid scripts`);

    // Ensure we have exactly 100 (or pad/trim)
    if (scripts100.length > 100) {
      scripts100 = scripts100.slice(0, 100);
    } else if (scripts100.length < 100) {
      console.warn(`Only generated ${scripts100.length}/100 scripts`);
    }

    await updateGen(genId, { progress: 75 });
    console.log('✅ Progress updated to 75% (Scripts generated)');

    // L5: Visual Prompt Enrichment (optimized chunking)
    console.log('L5: Enriching visual prompts...');
    console.log(`   Total scripts to enrich: ${scripts100.length}`);

    // Process in smaller chunks for better memory management and progress tracking
    const CHUNK_SIZE = 25;
    const chunks = [];
    for (let i = 0; i < scripts100.length; i += CHUNK_SIZE) {
      chunks.push(scripts100.slice(i, i + CHUNK_SIZE));
    }

    console.log(`   Processing in ${chunks.length} chunks of ${CHUNK_SIZE} scripts each`);

    const final = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`   Processing chunk ${i + 1}/${chunks.length} (${chunk.length} scripts)...`);

      const enrichedChunk = await openai.enrichVisualPrompts(
        product,
        model,
        payload.visualOverrides || '',
        chunk
      );

      final.push(...enrichedChunk);

      // Update progress incrementally
      const progress = 75 + Math.round(((i + 1) / chunks.length) * 20);
      await updateGen(genId, { progress });

      console.log(`   ✅ Chunk ${i + 1} completed. Progress: ${progress}%`);
    }

    console.log(`✅ Visual prompts enriched: ${final.length} scripts ready`);
    console.log('💾 Persisting to database...');
    await persistScriptsAndScenes(genId, final);

    await updateGen(genId, { status: 'completed', progress: 100 });
    console.log(`✅ Generation ${genId.substring(0, 8)} completed successfully!`);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`❌ Generation ${genId.substring(0, 8)} failed:`, errorMessage);
    console.error('Stack:', e instanceof Error ? e.stack : 'No stack');
    
    await updateGen(genId, {
      status: 'failed',
      error: errorMessage,
      progress: 0,
    });
    throw e;
  }
}
