"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGeneration = runGeneration;
const p_limit_1 = __importDefault(require("p-limit"));
const zod_1 = require("zod");
const supabaseClient_1 = require("../app/lib/supabaseClient");
const utils_1 = require("../app/lib/utils");
const openai = __importStar(require("../app/lib/adapters/openai"));
const gemini = __importStar(require("../app/lib/adapters/gemini"));
const limit = (0, p_limit_1.default)(4); // Safe concurrency for API calls
// Schema validation
const SceneSchema = zod_1.z.object({
    struktur: zod_1.z.enum(['Hook', 'Problem', 'Solution', 'CTA']),
    naskah_vo: zod_1.z.string(),
    visual_idea: zod_1.z.string(),
    text_to_image: zod_1.z.string().optional(),
    image_to_video: zod_1.z.string().optional(),
}).strict();
const ScriptSchema = zod_1.z.object({
    id: zod_1.z.string(),
    theme: zod_1.z.string(),
    scenes: zod_1.z.array(SceneSchema).min(3).max(4),
}).strict();
async function updateGen(genId, updates) {
    // Map status values to match database schema
    const statusMap = {
        'running': 'processing',
        'succeeded': 'completed',
        'failed': 'failed',
    };
    if (updates.status && statusMap[updates.status]) {
        updates.status = statusMap[updates.status];
    }
    // Skip error_message column - use 'error' field directly
    // Skip updated_at since column doesn't exist
    const { error } = await supabaseClient_1.supabaseAdmin
        .from('Generations') // Changed from generations to Generations
        .update(updates)
        .eq('id', genId);
    if (error) {
        console.error('❌ Update generation error:', error);
        throw new Error(`Failed to update generation: ${error.message}`);
    }
    console.log(`✅ Updated generation ${genId.substring(0, 8)}: ${JSON.stringify(updates)}`);
}
async function ensureProductModel(productId, product, modelId, model) {
    // Upsert product
    await supabaseClient_1.supabaseAdmin
        .from('Products')
        .upsert({
        product_identifier: productId,
        description: product,
    }, { onConflict: 'product_identifier' });
    // Upsert model - disabled due to missing column
    // await supabaseClient_1.supabaseAdmin
    //     .from('Models')
    //     .upsert({
    //     model_identifier: modelId,
    //     description: model,
    //     source: model.source,
    // }, { onConflict: 'model_identifier' });
}
function cosineSimilarity(a, b) {
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
async function pickUniqueThemes(params) {
    const { vectors, productId, desired } = params;
    const unique = [];
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
            if (unique.length >= desired)
                break;
        }
    }
    return unique.slice(0, desired);
}
async function insertIdeas(genId, themes) {
    // pgvector needs array format - Supabase automatically converts array to vector type
    const rows = themes.map((t) => ({
        generation_id: genId, // Reverted back to snake_case
        idea_text: t.text, // Try idea_text instead of idea_theme
        embedding: t.vector, // Pass as array, Supabase will convert to vector type
    }));
    const { error } = await supabaseClient_1.supabaseAdmin.from('Ideas').insert(rows);
    if (error) {
        console.error('❌ Insert ideas error:', error);
        throw new Error(`Failed to insert ideas: ${error.message}`);
    }
    console.log(`✅ Inserted ${rows.length} ideas`);
}
async function persistScriptsAndScenes(genId, scripts) {
    console.log(`💾 Persisting ${scripts.length} scripts and scenes...`);
    // First, get idea_ids for this generation (we need to link scripts to ideas)
    const { data: ideas } = await supabaseClient_1.supabaseAdmin
        .from('Ideas')
        .select('id, idea_text') // Changed back to idea_text
        .eq('generation_id', genId) // Reverted back to snake_case
        .order('created_at', { ascending: true });
    if (!ideas || ideas.length === 0) {
        console.error('❌ No ideas found for generation. Cannot persist scripts.');
        throw new Error('No ideas found for generation');
    }
    // Insert scripts and scenes
    for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        // Find matching idea by theme (first 20 scripts map to 20 ideas, then cycle)
        const ideaIndex = i % Math.min(ideas.length, 20);
        const ideaId = ideas[ideaIndex]?.id;
        if (!ideaId) {
            console.error(`❌ No idea found for script ${i + 1}`);
            continue;
        }
        const { data: scriptRow, error: scriptError } = await supabaseClient_1.supabaseAdmin
            .from('Scripts')
            .insert({
            generation_id: genId, // Reverted back to snake_case
            idea_id: ideaId, // Reverted back to snake_case
            theme: script.theme,
            idx: i + 1,
        })
            .select('id')
            .single();
        if (scriptError || !scriptRow) {
            console.error(`❌ Insert script ${i + 1} error:`, scriptError);
            continue;
        }
        // Insert scenes
        const sceneRows = script.scenes.map((scene, sceneIdx) => ({
            script_id: scriptRow.id, // Reverted back to snake_case
            order: sceneIdx + 1, // 1-indexed
            struktur: scene.struktur,
            naskah_vo: scene.naskah_vo,
            visual_idea: scene.visual_idea,
            text_to_image: scene.text_to_image || null,
            image_to_video: scene.image_to_video || null,
        }));
        const { error: scenesError } = await supabaseClient_1.supabaseAdmin
            .from('Scenes')
            .insert(sceneRows);
        if (scenesError) {
            console.error(`❌ Insert scenes for script ${i + 1} error:`, scenesError);
        }
        else {
            console.log(`✅ Saved script ${i + 1}/${scripts.length} with ${sceneRows.length} scenes`);
        }
    }
    console.log(`✅ Persisted ${scripts.length} scripts successfully`);
}
async function ensureGenerationExists(genId, payload) {
    // Check if generation exists, if not create it
    const { data: existing, error: checkError } = await supabaseClient_1.supabaseAdmin
        .from('Generations')
        .select('id')
        .eq('id', genId)
        .single();

    if (checkError && checkError.code === 'PGRST116') {
        // Generation doesn't exist, create it
        console.log('📝 Creating generation record...');
        const { error: createError } = await supabaseClient_1.supabaseAdmin
            .from('Generations')
            .insert({
                id: genId,
                idempotency_key: genId, // Use genId as idempotency_key for simplicity
                product_identifier: 'pending',
                engine: payload?.engine || 'gpt-4o', // Add required engine field
                status: 'queued', // Use 'queued' instead of 'pending'
                progress: 0
            });

        if (createError) {
            console.error('❌ Failed to create generation record:', createError);
            throw new Error(`Failed to create generation: ${createError.message}`);
        }

        console.log('✅ Generation record created');
    } else if (checkError) {
        console.error('❌ Error checking generation:', checkError);
        throw new Error(`Error checking generation: ${checkError.message}`);
    } else {
        console.log('✅ Generation record exists');
    }
}
async function runGeneration(genId, payload) {
    console.log(`🚀 Starting generation ${genId.substring(0, 8)}...`);
    try {
        // Ensure generation record exists first (create if needed)
        await ensureGenerationExists(genId, payload);
        await updateGen(genId, { status: 'processing', progress: 5 });
        // L0: Vision Analysis
        console.log('L0: Vision analysis...');
        console.log(`   Product image URL: ${payload.productImageUrl?.substring(0, 80)}...`);
        // Convert to base64 for reliability (no timeout issues)
        let productImageInput;
        try {
            const { imageUrlToBase64 } = await Promise.resolve().then(() => __importStar(require('./imageOptimizer')));
            productImageInput = await imageUrlToBase64(payload.productImageUrl);
            console.log('   ✅ Image converted to base64 (more reliable)');
        }
        catch (base64Error) {
            console.warn('   ⚠️  Base64 conversion failed, using URL:', base64Error);
            // Fallback to URL
            productImageInput = payload.productImageUrl;
        }
        let product;
        let productId;
        try {
            product = await openai.visionDescribeProduct(productImageInput);
            console.log('   ✅ Product analysis complete:', JSON.stringify(product));
            productId = (0, utils_1.stableHash)(JSON.stringify(product));
            console.log(`   Product ID: ${productId.substring(0, 16)}...`);
        }
        catch (error) {
            console.error('   ❌ Product vision analysis failed:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Vision analysis failed: ${errorMsg}`);
        }
        let model;
        let modelId;
        try {
            if (payload.modelImageUrl) {
                console.log(`   Model image URL: ${payload.modelImageUrl.substring(0, 80)}...`);
                // Convert to base64 for reliability
                let modelImageInput;
                try {
                    const { imageUrlToBase64 } = await Promise.resolve().then(() => __importStar(require('./imageOptimizer')));
                    modelImageInput = await imageUrlToBase64(payload.modelImageUrl);
                    console.log('   ✅ Model image converted to base64');
                }
                catch (base64Error) {
                    console.warn('   ⚠️  Base64 conversion failed, using URL:', base64Error);
                    modelImageInput = payload.modelImageUrl;
                }
                model = await openai.visionDescribeModel(modelImageInput);
                console.log('   ✅ Model analysis complete (from image)');
            }
            else {
                console.log('   Generating model description from basic idea...');
                model = await openai.genericModelDescribe(payload.basicIdea);
                console.log('   ✅ Model description generated');
            }
            modelId = (0, utils_1.stableHash)(JSON.stringify(model));
            console.log(`   Model ID: ${modelId.substring(0, 16)}...`);
        }
        catch (error) {
            console.error('   ❌ Model analysis failed:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Model analysis failed: ${errorMsg}`);
        }
        try {
            await ensureProductModel(productId, product, modelId, model);
            console.log('   ✅ Product & Model saved to database');
        }
        catch (error) {
            console.error('   ❌ Failed to save product/model:', error);
            throw error;
        }
        try {
            await updateGen(genId, {
                product_identifier: productId, // Reverted back to snake_case
                progress: 10,
            });
            console.log('   ✅ Generation updated to 10% with product/model IDs');
        }
        catch (error) {
            console.error('   ❌ Failed to update generation:', error);
            throw error;
        }
        // L1: Ideation (50 angles)
        console.log('L1: Ideation...');
        console.log('   Product:', JSON.stringify(product));
        console.log('   Basic Idea:', payload.basicIdea);
        const potentialIdeas = payload.engine === 'gpt-4o'
            ? await openai.ideation50(product, payload.basicIdea)
            : await gemini.ideation50Gemini(product, payload.basicIdea);
        console.log(`   ✅ OpenAI returned ${potentialIdeas.length} ideas`);
        // L2: Embed + Filter (adaptive uniqueness)
        console.log('L2: Embedding and filtering...');
        const vectors = await openai.embedBatch(potentialIdeas.slice(0, 50), 20);
        const themesWithVectors = potentialIdeas
            .slice(0, 50)
            .map((text, i) => ({ text, vector: vectors[i] }));
        const uniqueThemes = await pickUniqueThemes({
            vectors: themesWithVectors,
            productId,
            desired: 20,
        });
        await insertIdeas(genId, uniqueThemes);
        await updateGen(genId, { progress: 35 });
        console.log(`Selected ${uniqueThemes.length} unique themes`);
        // L3: Script Generation (20 themes × 5 scripts = 100)
        console.log('L3: Generating scripts...');
        const scriptPromises = uniqueThemes.map((theme) => limit(async () => {
            if (payload.engine === 'gpt-4o') {
                return await openai.script5(theme.text);
            }
            else {
                return await gemini.script5Gemini(theme.text);
            }
        }));
        const scriptBatches = await Promise.all(scriptPromises);
        let scripts100 = scriptBatches.flat();
        // Validate scripts
        scripts100 = scripts100.filter((s) => {
            try {
                ScriptSchema.parse(s);
                return true;
            }
            catch (e) {
                console.error('Invalid script schema:', e);
                return false;
            }
        });
        console.log(`Generated ${scripts100.length} valid scripts`);
        // Ensure we have exactly 100 (or pad/trim)
        if (scripts100.length > 100) {
            scripts100 = scripts100.slice(0, 100);
        }
        else if (scripts100.length < 100) {
            console.warn(`Only generated ${scripts100.length}/100 scripts`);
        }
        await updateGen(genId, { progress: 75 });
        // L5: Visual Prompt Enrichment (chunked)
        console.log('L5: Enriching visual prompts...');
        const final = await openai.enrichVisualPrompts(product, model, payload.visualOverrides || '', scripts100);
        console.log('Persisting to database...');
        await persistScriptsAndScenes(genId, final);
        await updateGen(genId, { status: 'completed', progress: 100 });
        console.log(`✅ Generation ${genId.substring(0, 8)} completed successfully!`);
    }
    catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error(`❌ Generation ${genId.substring(0, 8)} failed:`, errorMessage);
        console.error('Stack:', e instanceof Error ? e.stack : 'No stack');
        await updateGen(genId, {
            status: 'failed',
            error_message: errorMessage, // Try error_message instead of error
            progress: 0,
        });
        throw e;
    }
}
