"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.visionDescribeProduct = visionDescribeProduct;
exports.visionDescribeModel = visionDescribeModel;
exports.genericModelDescribe = genericModelDescribe;
exports.ideation50 = ideation50;
exports.script5 = script5;
exports.enrichVisualPrompts = enrichVisualPrompts;
exports.embedBatch = embedBatch;
exports.embedSingle = embedSingle;
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
async function visionDescribeProduct(imageInput) {
    // Support both URL and base64 data URI
    const isBase64 = imageInput.startsWith('data:image/');
    const imageUrl = isBase64 ? imageInput : imageInput;
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Analyze this product image and return STRICT JSON with these fields:
{
  "brand": "brand name if visible",
  "form_factor": "physical form (bottle, tube, jar, etc)",
  "colorway": "main colors",
  "key_benefit": "primary benefit or claim",
  "category": "product category",
  "notable_text": "any text visible on product"
}`,
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
        response_format: { type: 'json_object' },
        max_tokens: 300,
    });
    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
}
async function visionDescribeModel(imageInput) {
    // Support both URL and base64 data URI
    const isBase64 = imageInput.startsWith('data:image/');
    const imageUrl = isBase64 ? imageInput : imageInput;
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Analyze this model/person image and return STRICT JSON:
{
  "age_range": "estimated age range",
  "gender": "gender presentation",
  "ethnicity": "ethnicity/appearance",
  "appearance": "general appearance description",
  "style": "clothing/styling notes"
}`,
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
        response_format: { type: 'json_object' },
        max_tokens: 200,
    });
    const content = response.choices[0]?.message?.content || '{}';
    return { ...JSON.parse(content), source: 'vision' };
}
async function genericModelDescribe(basicIdea) {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
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
        max_tokens: 150,
    });
    const content = response.choices[0]?.message?.content || '{}';
    return { ...JSON.parse(content), source: 'generic' };
}
async function ideation50(product, basicIdea) {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
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
        max_tokens: 2000,
    });
    const content = response.choices[0]?.message?.content || '{"ideas":[]}';
    const parsed = JSON.parse(content);
    return parsed.ideas || parsed.angles || [];
}
async function script5(theme) {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
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

Keep each script under 320 tokens total. Return JSON array of 5 scripts.`,
            },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2500,
    });
    const content = response.choices[0]?.message?.content || '{"scripts":[]}';
    const parsed = JSON.parse(content);
    return parsed.scripts || [];
}
async function enrichVisualPrompts(product, model, overrides, scripts) {
    const chunks = [];
    const chunkSize = 25;
    for (let i = 0; i < scripts.length; i += chunkSize) {
        const chunk = scripts.slice(i, i + chunkSize);
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: 'You are a visual prompt engineer for AI image/video generation.',
                },
                {
                    role: 'user',
                    content: `Enrich these scripts with visual prompts.

Product Style: ${JSON.stringify(product)}
Model Style: ${JSON.stringify(model)}
Overrides: ${overrides || 'none'}

For each scene, add:
- "text_to_image": detailed prompt for static image generation
- "image_to_video": motion/animation description

Return the same JSON structure with added fields.

Scripts: ${JSON.stringify(chunk)}`,
                },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 3000,
        });
        const content = response.choices[0]?.message?.content || '{"scripts":[]}';
        const parsed = JSON.parse(content);
        chunks.push(...(parsed.scripts || []));
    }
    return chunks;
}
async function embedBatch(texts, batchSize = 20) {
    const vectors = [];
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
                console.error(`❌ Embedding batch ${Math.floor(i/batchSize) + 1} failed (attempt ${retries}/${maxRetries}):`, error.message);

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

        if (response) {
            vectors.push(...response.data.map((d) => d.embedding));
        }
    }

    console.log(`🔢 Embedding complete: ${vectors.length} vectors generated`);
    return vectors;
}
async function embedSingle(text) {
    const response = await openai.embeddings.create({
        model: EMBED_MODEL,
        input: text,
    });
    return response.data[0].embedding;
}
