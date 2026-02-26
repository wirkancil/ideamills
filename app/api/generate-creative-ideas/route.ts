import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const GenerateCreativeIdeasSchema = z.object({
  productAnalysis: z.any(),
  modelAnalysis: z.any().optional(),
  basicIdea: z.string().optional().default(''),
  engine: z.enum(['gpt-5.2', 'gemini-2.5-flash', 'gemini-1.5-flash']).optional().default('gpt-5.2'),
});

function cleanJson(text: string): string {
  // Remove markdown code blocks if present
  let cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  
  const firstOpenBrace = cleaned.indexOf('{');
  const firstOpenBracket = cleaned.indexOf('[');
  
  let start = -1;
  if (firstOpenBrace !== -1 && firstOpenBracket !== -1) {
    start = Math.min(firstOpenBrace, firstOpenBracket);
  } else if (firstOpenBrace !== -1) {
    start = firstOpenBrace;
  } else if (firstOpenBracket !== -1) {
    start = firstOpenBracket;
  }
  
  const lastCloseBrace = cleaned.lastIndexOf('}');
  const lastCloseBracket = cleaned.lastIndexOf(']');
  const end = Math.max(lastCloseBrace, lastCloseBracket);
  
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.substring(start, end + 1);
  }
  
  return cleaned;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request
    const validation = GenerateCreativeIdeasSchema.safeParse(body);
    if (!validation.success) {
      console.error('❌ Validation Error:', JSON.stringify(validation.error.errors, null, 2));
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      );
    }

    const {
      productAnalysis,
      modelAnalysis,
      basicIdea,
      engine
    } = validation.data;

    // Build product context
    let productContext = `PRODUK: ${productAnalysis.brand || 'Tidak terdeteksi'} - ${productAnalysis.category || 'Tidak terdeteksi'}
FORM FACTOR: ${productAnalysis.form_factor || 'Tidak terdeteksi'}
MANFAAT UTAMA: ${productAnalysis.key_benefit || 'Tidak terdeteksi'}
TARGET AUDIENCE: ${productAnalysis.target_audience || 'Tidak terdeteksi'}
WARNA: ${productAnalysis.color_scheme || 'Tidak terdeteksi'}
STYLE: ${productAnalysis.style || 'Tidak terdeteksi'}`;

    if (productAnalysis.notable_text) {
      productContext += `\nTEKS PENTING: ${productAnalysis.notable_text}`;
    }

    if (modelAnalysis) {
      productContext += `\n\nMODEL: ${modelAnalysis.age_range || 'Tidak terdeteksi'} tahun, ${modelAnalysis.gender || 'Tidak terdeteksi'}, ${modelAnalysis.ethnicity || 'Tidak terdeteksi'}`;
    }

    const systemPrompt = `You are a Senior Creative Strategist and Viral Content Creator (Ahli Strategi Kreatif & Kreator Konten Viral).

Your goal is to generate high-converting video ad concepts based on product and model analysis.
You must adopt the persona of a marketing genius who understands audience psychology, trends, and brand storytelling.

Based on the provided product analysis and user's basic idea, generate 3-5 distinct creative video ad concepts.

Each concept must include:
1. **The Hook**: A catchy title or angle.
2.91→2. **The Angle**: Why this works for the target audience.
92→3. **The Vibe**: The emotional tone (e.g., "High-energy", "Soothing", "Luxury").
93→4. **Why it Sells**: The psychological trigger used.
94→
95→Format output: Return a JSON object with a "creativeIdeas" array containing the concepts:
96→{
97→  "creativeIdeas": [
98→    {
99→      "title": "...",
100→      "concept": "...",
101→      "storyline": "...",
102→      "why_effective": "..."
103→    }
104→  ]
105→}`;

    const userPrompt = `IDE DASAR DARI USER: "${basicIdea}"

KONTEKS PRODUK:
${productContext}

Buatlah 3-5 ide kreatif yang berbeda untuk kampanye iklan produk ini.`;

    let content = '';

    if (engine.startsWith('gemini')) {
      const modelName = engine; // gemini-2.5-flash or gemini-1.5-flash
      const model = genAI.getGenerativeModel({ model: modelName });
      
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
        ],
        generationConfig: {
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      });
      content = result.response.text();
    } else {
      const response = await openai.chat.completions.create({
        model: 'gpt-5.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_completion_tokens: 2000,
        response_format: { type: 'json_object' } // Ensure JSON output
      });
      content = response.choices[0]?.message?.content || '';
    }

    if (!content) {
      throw new Error(`No response from ${engine}`);
    }

    // Try to parse JSON response
    let creativeIdeas;
    try {
      const jsonContent = cleanJson(content);
      // Handle wrapped JSON object if needed (e.g. { "ideas": [...] })
      const parsed = JSON.parse(jsonContent);
      if (Array.isArray(parsed)) {
        creativeIdeas = parsed;
      } else if (parsed.creativeIdeas && Array.isArray(parsed.creativeIdeas)) {
        creativeIdeas = parsed.creativeIdeas;
      } else if (parsed.ideas && Array.isArray(parsed.ideas)) {
        creativeIdeas = parsed.ideas;
      } else {
         // Fallback: try to find an array in the object values
         const arrayValue = Object.values(parsed).find(v => Array.isArray(v));
         if (arrayValue) {
           creativeIdeas = arrayValue;
         } else {
           creativeIdeas = [parsed]; // Treat as single item array if all else fails
         }
      }
    } catch (parseError) {
      console.error('Failed to parse JSON response. Raw content:', content);
      console.error('Parse error:', parseError);
      // Fallback: try to extract ideas from text manually or return error
      throw new Error('Failed to parse AI response as JSON');
    }

    return NextResponse.json({ creativeIdeas: creativeIdeas });

  } catch (error) {
    console.error('Error generating creative ideas:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

