import OpenAI from 'openai';
import { ProductDescription, ModelDescription } from '../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';

export async function visionDescribeProduct(
  imageInput: string,
  basicIdea?: string,
  visualDescription?: string
): Promise<ProductDescription> {
  // Support both URL and base64 data URI
  const isBase64 = imageInput.startsWith('data:image/');
  const imageUrl = isBase64 ? imageInput : imageInput;

  console.log(`   [OpenAI Vision] Calling API with ${isBase64 ? 'base64' : 'URL'} input`);
  console.log(`   [OpenAI Vision] Input length: ${imageInput.length} chars`);
  if (isBase64) {
    const base64Data = imageInput.split(',')[1] || '';
    console.log(`   [OpenAI Vision] Base64 data length: ${base64Data.length} chars (${(base64Data.length * 3 / 4 / 1024 / 1024).toFixed(2)} MB estimated)`);
  }
  if (basicIdea) {
    console.log(`   [OpenAI Vision] Context: basicIdea provided (${basicIdea.length} chars)`);
  }
  if (visualDescription) {
    console.log(`   [OpenAI Vision] Context: visual description provided (${visualDescription.length} chars)`);
  }

  // Build prompt with context if available
  let promptText = `You are an expert Commercial Photographer and Visual Analyst (Sutradara Fotografi & Analis Visual).

Your goal is to extract technical visual data from product images to inform high-end commercial video production.
You must focus on lighting, composition, color palette, and texture details that a Director of Photography would need.

Analyze the image and provide a structured JSON output with the following fields:
- brand: (string) The brand name visible on the product.
- category: (string) The product category (e.g., skincare, beverage, gadget).
- form_factor: (string) The physical form (e.g., bottle, jar, box, tube).
- target_audience: (string) The inferred target audience based on design language.
- style: (string) The visual style (e.g., minimalist, luxury, playful, clinical).
- color_scheme: (string) Dominant hex colors (comma separated).
- key_benefit: (string) Main benefit or unique selling point (comma separated).
- notable_text: (string) All visible text on packaging, slogans, or important info.
- ingredients: (string) Visible ingredients (comma separated).
- additional_notes: (string) Technical notes on lighting, texture, and reflections for a cinematographer.
`;

  // Add context from basicIdea if provided
  if (basicIdea && basicIdea.trim()) {
    promptText += `\n\nContext - Product Idea: "${basicIdea}"\nPlease focus on aspects relevant to this concept when analyzing the image.`;
  }

  // Add visual description/overrides if provided
  if (visualDescription && visualDescription.trim()) {
    promptText += `\n\nVisual Description/Overrides: "${visualDescription}"\nUse this description to guide your analysis and focus on matching visual elements mentioned.`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: promptText,
            },
            {
              type: 'image_url',
              image_url: isBase64
                ? { url: imageUrl } // base64 data URI
                : { url: imageUrl }, // regular URL
            },
          ],
        },
      ],
      // Note: response_format not used for vision API to avoid compatibility issues
      max_completion_tokens: 1000,
    });

    console.log(`   [OpenAI Vision] Response received, status: ${response.choices[0]?.finish_reason || 'unknown'}`);

    const rawContent = response.choices[0]?.message?.content;
    console.log(`   [OpenAI Vision] Raw content exists: ${!!rawContent}`);
    console.log(`   [OpenAI Vision] Raw content type: ${typeof rawContent}`);
    console.log(`   [OpenAI Vision] Raw content length: ${rawContent?.length || 0}`);

    const content = rawContent || '{}';
    console.log(`   [OpenAI Vision] Final content: "${content.substring(0, 200)}..."`);

    if (!content || content.trim() === '{}') {
      console.error(`   [OpenAI Vision] Empty content detected!`);
      console.error(`   [OpenAI Vision] Full response:`, JSON.stringify(response, null, 2));
      throw new Error('Empty response from OpenAI Vision API');
    }
    
    let parsed: ProductDescription;
    try {
      // Try to parse as JSON first (in case GPT returns JSON anyway)
      parsed = JSON.parse(content) as ProductDescription;
    } catch (parseError) {
      console.log(`   [OpenAI Vision] Direct JSON parse failed, trying to extract JSON from text...`);

      // Try to extract JSON from text response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]) as ProductDescription;
          console.log(`   [OpenAI Vision] Successfully extracted JSON from text response`);
        } catch (extractError) {
          console.error(`   [OpenAI Vision] JSON extraction failed:`, extractError);
          console.error(`   [OpenAI Vision] Raw content:`, content);
          throw new Error(`Failed to extract JSON from OpenAI response: ${extractError instanceof Error ? extractError.message : String(extractError)}`);
        }
      } else {
        console.error(`   [OpenAI Vision] No JSON found in response`);
        console.error(`   [OpenAI Vision] Raw content:`, content);
        throw new Error(`No JSON found in OpenAI response. Raw content: ${content.substring(0, 200)}`);
      }
    }
    
    // Normalize keys just in case
    const normalized: any = { ...parsed };
    if (normalized.benefits && !normalized.key_benefit) {
      normalized.key_benefit = normalized.benefits;
      delete normalized.benefits;
    }
    if (normalized.visual_notes && !normalized.additional_notes) {
      normalized.additional_notes = normalized.visual_notes;
      delete normalized.visual_notes;
    }
    if (!normalized.notable_text) {
      normalized.notable_text = "";
    }
    
    console.log(`   [OpenAI Vision] Parsed successfully:`, JSON.stringify(normalized, null, 2));
    
    return normalized as ProductDescription;
  } catch (error) {
    console.error(`   [OpenAI Vision] API call failed:`, error);
    if (error && typeof error === 'object') {
      const apiError = error as any;
      if (apiError.response) {
        console.error(`   [OpenAI Vision] API Error Response:`, {
          status: apiError.response.status,
          statusText: apiError.response.statusText,
          data: apiError.response.data,
        });
      }
      if (apiError.message) {
        console.error(`   [OpenAI Vision] Error Message:`, apiError.message);
      }
    }
    throw error;
  }
}

export async function visionDescribeModel(imageInput: string): Promise<ModelDescription> {
  // Support both URL and base64 data URI
  const isBase64 = imageInput.startsWith('data:image/');
  const imageUrl = isBase64 ? imageInput : imageInput;

  console.log(`   [OpenAI Vision Model] Calling API with ${isBase64 ? 'base64' : 'URL'} input`);
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an expert Casting Director and Portrait Photographer (Direktur Casting & Fotografer Potret).

Your goal is to analyze the model's appearance for a commercial video shoot.
Focus on expression, acting potential, styling, and physical attributes that match specific brand archetypes.

Analyze the image and return STRICT JSON with these fields:
{
  "gender": "string" (e.g. male, female, non-binary),
  "age_range": "string" (e.g. baby, toddler, child, teen, young-adult, adult, mature, senior),
  "hair_style": "string" (e.g. long, medium, short, curly, straight, wavy, ponytail, bun, bald, buzzed, dreadlocks, braids, colored, messy),
  "ethnicity": "string" (e.g. asian, black, hispanic, white, middle-eastern, mixed, south-asian, southeast-asian),
  "skin_tone": "string" (e.g. fair, light, medium, tan, dark, deep),
  "expression": "string" (e.g. smiling, serious, confident, natural, happy, relaxed, professional, excited, thoughtful, intense, mysterious, playful, angry),
  "body_type": "string" (e.g. slim, athletic, average, curvy, plus-size, muscular, petite, tall),
  "pose": "string" (e.g. portrait, profile, three-quarter, full-body, close-up, action, sitting, lying, jumping, walking, running, dancing, yoga),
  "model_notes": "Technical notes on styling, makeup, and acting range."
}

If no person is visible in the image, return null for all fields or empty strings.`,
            },
            {
              type: 'image_url',
              image_url: isBase64
                ? { url: imageUrl } // base64 data URI
                : { url: imageUrl }, // regular URL
            },
          ],
        },
      ],
      // Note: response_format not used for vision API to avoid compatibility issues
      max_completion_tokens: 1000,
    });

    console.log(`   [OpenAI Vision Model] Response received`);

    const rawContent = response.choices[0]?.message?.content;
    console.log(`   [OpenAI Vision Model] Raw content exists: ${!!rawContent}`);
    console.log(`   [OpenAI Vision Model] Raw content length: ${rawContent?.length || 0}`);

    const content = rawContent || '{}';
    console.log(`   [OpenAI Vision Model] Final content: "${content.substring(0, 200)}..."`);

    if (!content || content.trim() === '{}') {
      console.error(`   [OpenAI Vision Model] Empty content detected!`);
      throw new Error('Empty response from OpenAI Vision API');
    }

    let parsed: any;
    try {
      // Try to parse as JSON first
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.log(`   [OpenAI Vision Model] Direct JSON parse failed, trying to extract JSON from text...`);

      // Try to extract JSON from text response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
          console.log(`   [OpenAI Vision Model] Successfully extracted JSON from text response`);
        } catch (extractError) {
          console.error(`   [OpenAI Vision Model] JSON extraction failed:`, extractError);
          console.error(`   [OpenAI Vision Model] Raw content:`, content);
          throw new Error(`Failed to extract JSON from OpenAI response: ${extractError instanceof Error ? extractError.message : String(extractError)}`);
        }
      } else {
        console.error(`   [OpenAI Vision Model] No JSON found in response`);
        console.error(`   [OpenAI Vision Model] Raw content:`, content);
        throw new Error(`No JSON found in OpenAI response. Raw content: ${content.substring(0, 200)}`);
      }
    }
    
    const result = { ...parsed, source: 'vision' } as ModelDescription;
    console.log(`   [OpenAI Vision Model] Parsed successfully`);
    
    return result;
  } catch (error) {
    console.error(`   [OpenAI Vision Model] API call failed:`, error);
    if (error && typeof error === 'object') {
      const apiError = error as any;
      if (apiError.response) {
        console.error(`   [OpenAI Vision Model] API Error Response:`, {
          status: apiError.response.status,
          statusText: apiError.response.statusText,
          data: apiError.response.data,
        });
      }
    }
    throw error;
  }
}

export async function genericModelDescribe(basicIdea: string): Promise<ModelDescription> {
  const response = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [
      {
        role: 'user',
        content: `Based on this product idea: "${basicIdea}", suggest a target audience persona in JSON:
{
  "age_range": "target age",
  "gender": "target gender",
  "appearance": "suggested model appearance",
  "style": "suggested styling"
}`,
      },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 150,
  });

  const content = response.choices[0]?.message?.content || '{}';
  return { ...JSON.parse(content), source: 'generic' } as ModelDescription;
}

export async function ideation50(
  product: ProductDescription,
  basicIdea: string
): Promise<string[]> {
  console.log('🧠 OpenAI Ideation - Input:');
  console.log('   Product:', JSON.stringify(product, null, 2));
  console.log('   Basic Idea:', basicIdea);

  const response = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [
      {
        role: 'system',
        content: 'You are a creative marketing strategist specializing in ad concepts.',
      },
      {
        role: 'user',
        content: `Generate 50 distinct marketing angles for this product:
Product: ${JSON.stringify(product)}
Basic Idea: ${basicIdea}

Cover these categories:
- Problem-solution angles (15)
- Lifestyle/aspiration angles (15)
- Social proof/UGC angles (10)
- Educational/how-to angles (5)
- Trend/seasonal angles (5)

Return as JSON array of strings: ["angle 1", "angle 2", ...]`,
      },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || '{"ideas":[]}';
  console.log('🧠 OpenAI Ideation - Raw Response:', content);

  const parsed = JSON.parse(content);
  console.log('🧠 OpenAI Ideation - Parsed:', JSON.stringify(parsed, null, 2));

  // Handle different response formats
  let ideas: string[] = [];

  if (Array.isArray(parsed)) {
    // Direct array response
    ideas = parsed;
  } else if (parsed.ideas && Array.isArray(parsed.ideas)) {
    // Simple object with ideas array
    ideas = parsed.ideas;
  } else if (parsed.angles && Array.isArray(parsed.angles)) {
    // Check if it's a nested structure or simple array
    if (parsed.angles.length > 0 && typeof parsed.angles[0] === 'object' && parsed.angles[0].angles) {
      // Nested structure like { angles: [{ category: "...", angles: [...] }] }
      const nestedIdeas: string[] = [];
      for (const categoryGroup of parsed.angles) {
        if (categoryGroup.angles && Array.isArray(categoryGroup.angles)) {
          nestedIdeas.push(...categoryGroup.angles);
        }
      }
      ideas = nestedIdeas;
    } else {
      // Simple object with angles array
      ideas = parsed.angles;
    }
  } else if (parsed.marketing_angles && Array.isArray(parsed.marketing_angles)) {
    // Handle marketing_angles format
    ideas = parsed.marketing_angles;
  } else if (parsed.categories && Array.isArray(parsed.categories)) {
    // Handle categories format
    const categoryIdeas: string[] = [];
    for (const category of parsed.categories) {
      if (category.angles && Array.isArray(category.angles)) {
        categoryIdeas.push(...category.angles);
      }
    }
    ideas = categoryIdeas;
  }

  console.log('🧠 OpenAI Ideation - Final count:', ideas.length);

  return ideas;
}

export async function script5(theme: string): Promise<any[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [
      {
        role: 'system',
        content: 'You are an expert ad scriptwriter. Create concise, impactful scripts.',
      },
      {
        role: 'user',
        content: `Create 5 different script variations for this theme: "${theme}"

Each script must have 3-4 scenes with this structure:
{
  "id": "unique_id",
  "theme": "${theme}",
  "scenes": [
    {
      "struktur": "Hook",
      "naskah_vo": "voiceover text in Bahasa Indonesia",
      "visual_idea": "visual description"
    },
    {
      "struktur": "Problem",
      "naskah_vo": "...",
      "visual_idea": "..."
    },
    {
      "struktur": "Solution",
      "naskah_vo": "...",
      "visual_idea": "..."
    },
    {
      "struktur": "CTA",
      "naskah_vo": "...",
      "visual_idea": "..."
    }
  ]
}

Keep each script under 500 tokens total. Return JSON array of 5 scripts.`,
      },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 2500,
  });

  const content = response.choices[0]?.message?.content || '{"scripts":[]}';
  const parsed = JSON.parse(content);
  return parsed.scripts || [];
}

export async function enrichVisualPrompts(
  product: ProductDescription,
  model: ModelDescription,
  overrides: string,
  scripts: any[]
): Promise<any[]> {
  const chunks = [];
  const chunkSize = 25;
  const totalChunks = Math.ceil(scripts.length / chunkSize);

  console.log(`🎨 Visual Prompt Enrichment: Processing ${scripts.length} scripts in ${totalChunks} batches (${chunkSize} per batch)`);

  for (let i = 0; i < scripts.length; i += chunkSize) {
    const chunk = scripts.slice(i, i + chunkSize);
    const chunkNumber = Math.floor(i / chunkSize) + 1;
    console.log(`🎨 Processing batch ${chunkNumber}/${totalChunks} (scripts ${i + 1}-${Math.min(i + chunkSize, scripts.length)})...`);

    const systemPrompt = 'You are an expert visual prompt engineer for AI image and video generation. You create detailed, production-ready prompts that ensure consistency between static images and video motion.';

    const userPrompt = `Enrich these scripts with detailed visual prompts for professional ad production.

Product Style: ${JSON.stringify(product)}
Model Style: ${JSON.stringify(model)}
Visual Overrides: ${overrides || 'none'}

IMPORTANT REQUIREMENTS:

1. TEXT_TO_IMAGE:
   - Create detailed prompts for ALL static images needed for this scene
   - If the scene requires multiple shots/images (e.g., before/after, split screen, montage), describe EACH image separately
   - Each image description must be detailed enough for AI image generation:
     * Camera angle, framing, composition
     * Lighting setup (natural, studio, mood)
     * Color palette matching product style
     * Model appearance matching Model Style
     * Product placement and visibility
     * Background and environment
     * Technical specs (resolution, style, quality)
   - Format: If multiple images needed, number them clearly:
     "Image 1: [detailed description] | Image 2: [detailed description]"
   - Ensure all images align with the visual_idea and naskah_vo

2. IMAGE_TO_VIDEO:
   - Create a detailed SECOND-BY-SECOND motion breakdown
   - Duration: Estimate total duration (typically 3-5 seconds per scene)
   - For each second, describe:
     * Camera movement (zoom, pan, tilt, track, static)
     * Subject movement (model actions, product interaction)
     * Transitions (fade, cut, dissolve, wipe)
     * Visual effects (lighting changes, color grading, overlays)
     * Audio sync points (if applicable)
   - Format: Timeline breakdown:
     "0-1s: [motion description]
     1-2s: [motion description]
     2-3s: [motion description]
     ..."
   - Ensure motion matches the static images from text_to_image
   - If multiple images in text_to_image, describe smooth transitions between them

3. VISUAL CONSISTENCY & PRODUCT CONTINUITY (CRITICAL):
   - PRODUCT CONSISTENCY IS MANDATORY. The product must look IDENTICAL in every single frame/second.
   - Refer strictly to "Product Style" for every visual description.
   - VISUAL ANCHORS: Select 3-5 visual keywords (e.g., "Golden cap", "Blue bottle", "Model's red lips") that MUST appear in EVERY single second description to force the AI to maintain them.
   - MINIMIZE RE-DESCRIPTION: Since the user will use Image-to-Video with a source image, do NOT over-describe the product's look in the motion prompts. Focus on ACTION and MOVEMENT.
   - MICRO-MOVEMENTS: Prefer subtle, realistic movements (e.g., "gentle breathing", "subtle smile", "slow product rotation") over complex actions to prevent "face morphing" or hallucinations.
   - If the product is shown, use simple, consistent keywords from the analysis (e.g., "the gold bottle") rather than flowery adjectives that might confuse the external model.
   - Do not hallucinate new product features.
   - Model appearance must be locked and identical across all shots. Do not change age, hair, or facial features.
   - text_to_image and image_to_video MUST be consistent.

4. TEXT OVERLAY ACCURACY (CRITICAL):
   - AI struggles with long text. KEEP OVERLAYS SHORT (1-5 words max).
   - EXACT SPELLING IS MANDATORY.
   - For every text overlay, specify: 'Text overlay: "EXACT TEXT"'.
   - Add visual descriptors for text: "Bold, sans-serif, legible, high contrast".
   - Ensure text is placed in negative space (empty areas) to avoid clutter.

5. SCENE STRUCTURE & TRANSITIONS (CRITICAL):
   - Hook scenes: Eye-catching, dynamic, product-focused.
   - Problem scenes: Emotive, relatable, clear visual contrast.
   - Solution scenes: Product in action, transformation visible.
   - CTA scenes: Clear, direct, product prominent, call-to-action visible.
   - SMOOTH TRANSITIONS: The end of one second MUST flow logically into the start of the next. Avoid abrupt cuts unless specified. Describe the continuous motion (e.g., "camera continues panning right").

6. DIRECTOR'S SCRIPT (Detailed Shooting Guide):
   - For the ENTIRE script (at the root level, not per scene), add a "directors_script" field.
   - This must be a comprehensive 30-second commercial shooting guide.
   - CRITICAL: Keep the setup sections (tone, location, character, lighting) CONCISE and BRIEF to save token space.
   - Include the following specific fields in the JSON object:
     * general_tone_mood: Overall emotional arc and visual style (Max 2 sentences).
     * location_set_design: Environment description (Brief, focus on key elements).
     * character_wardrobe_grooming: Model details (Brief, focus on key visual traits).
     * lighting_camera_strategy: Technical setup (Brief summary).
     * product_continuity_notes: Specific rules to ensure the product looks consistent (e.g., "Always show label facing camera", "Lighting must highlight metallic rim").
     * prop_list: Array of essential props only.
     * timeline_breakdown: THIS IS THE CORE SECTION. Provide a DETAILED second-by-second breakdown (0-30s), grouped in 3-second chunks.
       - Allocate 90% of your descriptive effort here.
       - Format as a clear chronological list of objects.
       - Each second MUST include:
         - time: "0-3s", "3-6s", etc.
         - visual: Detailed action and movement description. If product is shown, use simple keywords.
         - text_overlay: "EXACT WORDING" (or "None").
         - audio_dialogue: "Character/VO line" or "Music/SFX only".
         - transition: How this shot flows into the next (e.g., "Cut to...", "Smooth pan to...").
       - 0-3s (Hook): Immediate visual hook, fast cuts.
       - 3-6s (Hook/Intro): Establish context/interest.
       - 6-9s (Problem): Introduce conflict/pain point.
       - 9-12s (Problem/Agitation): Escalate the issue.
       - 12-15s (Solution): Reveal the product as hero.
       - 15-18s (Benefit): Key feature demonstration.
       - 18-21s (Benefit): Secondary benefit/Social proof.
       - 21-24s (Result): Outcome/Transformation shown.
       - 24-27s (CTA): Offer details/Urgency.
       - 27-30s (CTA): Final branding/Call to action.
   - This serves as the master guide for the production team.
   - STRICT LENGTH LIMIT: The entire Director's Script must be concise and UNDER 4000 CHARACTERS in total length. Focus on key visual actions.

   For each scene in the script, you MUST add:
   - "text_to_image": Detailed prompt(s) for static image(s) generation.
   - "image_to_video": Second-by-second motion/animation breakdown with timeline.

7. OUTPUT FORMAT:
   - Return a JSON object with a 'scripts' key containing the array of modified scripts.

Scripts: ${JSON.stringify(chunk)}`;

    let response;
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        if (retries > 0) console.log(`   🔄 Enrichment retry attempt ${retries + 1}/${maxRetries}...`);
        
        response = await openai.chat.completions.create({
          model: 'gpt-5.2',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 12000,
        });

        const contentCheck = response.choices[0]?.message?.content;
        if (contentCheck) {
          break; // Success
        } else {
          throw new Error('Empty response from OpenAI');
        }
      } catch (err) {
        retries++;
        console.error(`   ⚠️ Enrichment attempt ${retries} failed:`, err);
        if (retries >= maxRetries) {
          console.error('   ❌ Max retries reached for enrichment batch');
        } else {
           const delay = Math.pow(2, retries) * 1000;
           await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    const content = response?.choices[0]?.message?.content || '{"scripts":[]}';
    console.log('🔍 OpenAI Enrichment Raw Response:', content.substring(0, 500) + '...'); // Log first 500 chars
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('❌ JSON Parse Error:', e);
      console.error('Raw Content:', content);
      parsed = { scripts: [] };
    }

    const enrichedScripts = parsed.scripts || (parsed.directors_script ? [parsed] : []);
    chunks.push(...enrichedScripts);
    console.log(`✅ Batch ${chunkNumber}/${totalChunks} completed: ${enrichedScripts.length} scripts enriched`);
  }

  console.log(`🎨 Visual Prompt Enrichment complete: ${chunks.length} scripts enriched with visual prompts`);
  return chunks;
}

export async function embedBatch(texts: string[], batchSize = 20): Promise<number[][]> {
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    console.log(`🔢 Embedding batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(texts.length/batchSize)} (${batch.length} texts)`);

    // Retry logic for embeddings
    let retries = 0;
    const maxRetries = 3;
    let response;

    while (retries < maxRetries) {
      try {
        // Add timeout to the request
        response = await Promise.race([
          openai.embeddings.create({
            model: EMBED_MODEL,
            input: batch,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Embedding request timeout')), 30000) // 30 second timeout
          )
        ]);

        console.log(`✅ Batch ${Math.floor(i/batchSize) + 1} embedded successfully`);
        break; // Success, exit retry loop

      } catch (error) {
        retries++;
        console.error(`❌ Embedding batch ${Math.floor(i/batchSize) + 1} failed (attempt ${retries}/${maxRetries}):`, error instanceof Error ? error.message : 'Unknown error');

        if (retries >= maxRetries) {
          console.error(`❌ Max retries exceeded for batch ${Math.floor(i/batchSize) + 1}, skipping batch`);
          // Add empty vectors for this batch to maintain array length
          const emptyVectors = batch.map(() => new Array(1536).fill(0)); // 1536 is typical for text-embedding-3-small
          vectors.push(...emptyVectors);
          continue;
        }

        // Wait before retry (exponential backoff)
        const waitTime = Math.min(1000 * Math.pow(2, retries - 1), 5000); // 1s, 2s, 4s max
        console.log(`⏳ Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    if (response && (response as any).data) {
      vectors.push(...(response as any).data.map((d: any) => d.embedding));
    }
  }

  console.log(`🔢 Embedding complete: ${vectors.length} vectors generated`);
  return vectors;
}

export async function embedSingle(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}
