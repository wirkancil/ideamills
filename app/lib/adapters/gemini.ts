import { GoogleGenerativeAI } from '@google/generative-ai';
import { ProductDescription } from '../types';
import { getDb } from '../mongoClient';
import { GridFSBucket, ObjectId } from 'mongodb';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// Using Gemini 2.5 Flash (latest stable, fast and cost-effective)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

function cleanJson(text: string): string {
  // Remove markdown code blocks if present
  let cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  // Find the first '{' and last '}'
  const firstOpen = cleaned.indexOf('{');
  const lastClose = cleaned.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1) {
    cleaned = cleaned.substring(firstOpen, lastClose + 1);
  }
  return cleaned;
}

// Helper to fetch image and convert to base64
async function urlToGenerativePart(url: string, mimeType: string): Promise<{ inlineData: { data: string; mimeType: string } }> {
  try {
    // If localhost, try to fetch directly from MongoDB GridFS to avoid network issues
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      const id = url.split('/').pop();
      if (id) {
        try {
          const db = await getDb();
          const bucket = new GridFSBucket(db, { bucketName: process.env.MONGODB_BUCKET || 'images' });
          
          // Create a buffer from the download stream
          const downloadStream = bucket.openDownloadStream(new ObjectId(id));
          
          const chunks: Buffer[] = [];
          for await (const chunk of downloadStream) {
            chunks.push(chunk);
          }
          
          const buffer = Buffer.concat(chunks);
          
          return {
            inlineData: {
              data: buffer.toString('base64'),
              mimeType
            },
          };
        } catch (dbError) {
          console.warn(`Failed to fetch from GridFS directly, falling back to HTTP fetch: ${dbError}`);
          // Fallthrough to fetch
        }
      }
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText} while downloading ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType
      },
    };
  } catch (error) {
    throw new Error(`Failed to fetch image from ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function visionDescribeProductGemini(
  imageInput: string,
  basicIdea?: string,
  visualDescription?: string
): Promise<any> {
  // Handle base64 or URL
  let imagePart;
  if (imageInput.startsWith('data:image/')) {
    const mimeType = imageInput.substring(5, imageInput.indexOf(';'));
    const data = imageInput.split(',')[1];
    imagePart = {
      inlineData: {
        data,
        mimeType
      }
    };
  } else {
    // Assume URL
    // Default to jpeg if not detectable, but usually we can infer or just use generic
    imagePart = await urlToGenerativePart(imageInput, 'image/jpeg');
  }

  let prompt = `You are an expert Commercial Photographer and Visual Analyst (Sutradara Fotografi & Analis Visual).

Your goal is to extract technical visual data from product images to inform high-end commercial video production.
You must focus on lighting, composition, color palette, and texture details that a Director of Photography would need.

Analyze the image and provide a structured JSON output with the following fields.
IMPORTANT: Return ONLY valid JSON. No markdown formatting, no code blocks, no intro/outro text.

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

  if (basicIdea) {
    prompt += `\n\nContext - Product Idea: "${basicIdea}"\nPlease focus on aspects relevant to this concept when analyzing the image.`;
  }

  if (visualDescription) {
    prompt += `\n\nVisual Description/Overrides: "${visualDescription}"\nUse this description to guide your analysis.`;
  }

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
    generationConfig: {
      maxOutputTokens: 1000,
      responseMimeType: 'application/json',
    },
  });

  const text = result.response.text();
  try {
    const cleaned = cleanJson(text);
    const parsed = JSON.parse(cleaned);
    
    // Normalize keys
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

    return normalized;
  } catch (e) {
    console.error('Gemini Vision JSON parse error:', e);
    console.error('Raw Gemini output:', text);
    return {};
  }
}

export async function visionDescribeModelGemini(imageInput: string): Promise<any> {
  // Handle base64 or URL
  let imagePart;
  if (imageInput.startsWith('data:image/')) {
    const mimeType = imageInput.substring(5, imageInput.indexOf(';'));
    const data = imageInput.split(',')[1];
    imagePart = {
      inlineData: {
        data,
        mimeType
      }
    };
  } else {
    imagePart = await urlToGenerativePart(imageInput, 'image/jpeg');
  }

  let prompt = `You are an expert Casting Director and Portrait Photographer (Direktur Casting & Fotografer Potret).

Your goal is to analyze the model's appearance for a commercial video shoot.
Focus on expression, acting potential, styling, and physical attributes that match specific brand archetypes.

Analyze the image and return STRICT JSON with these fields.
IMPORTANT: Return ONLY valid JSON. No markdown formatting, no code blocks.

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
}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
    generationConfig: {
      maxOutputTokens: 1000,
      responseMimeType: 'application/json',
    },
  });

  const text = result.response.text();
  try {
    const cleaned = cleanJson(text);
    const parsed = JSON.parse(cleaned);
    return { ...parsed, source: 'vision' };
  } catch (e) {
    console.error('Gemini Vision Model JSON parse error:', e);
    return {};
  }
}

export async function ideation50Gemini(
  product: ProductDescription,
  basicIdea: string
): Promise<string[]> {
  const prompt = `Generate 50 distinct marketing angles for this product:
Product: ${JSON.stringify(product)}
Basic Idea: ${basicIdea}

Cover these categories:
- Problem-solution angles (15)
- Lifestyle/aspiration angles (15)
- Social proof/UGC angles (10)
- Educational/how-to angles (5)
- Trend/seasonal angles (5)

Return as JSON object with "ideas" array: {"ideas": ["angle 1", "angle 2", ...]}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 2000,
    },
  });

  const response = result.response;
  const text = response.text();
  try {
    const cleaned = cleanJson(text);
    const parsed = JSON.parse(cleaned);
    return parsed.ideas || parsed.angles || [];
  } catch (e) {
    console.error('Gemini JSON parse error:', e);
    console.log('Raw text:', text);
    return [];
  }
}

export async function script5Gemini(theme: string): Promise<any[]> {
  const prompt = `Create 5 different script variations for this theme: "${theme}"

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

Keep each script under 320 tokens total. Return JSON object with "scripts" array.`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 2500,
    },
  });

  const text = result.response.text();
  try {
    const cleaned = cleanJson(text);
    const parsed = JSON.parse(cleaned);
    return parsed.scripts || [];
  } catch (e) {
    console.error('Gemini JSON parse error:', e);
    console.log('Raw text:', text);
    return [];
  }
}

