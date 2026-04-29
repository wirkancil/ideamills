import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolvePreset } from '@/app/lib/llm/registry';
import { chatCompletion } from '@/app/lib/llm/client';
import { parseJson, withRetry, logUsage } from '@/app/lib/llm/middleware';

const PRESET_NAMES = ['fast', 'balanced', 'premium', 'custom'] as const;

const GenerateCreativeIdeasSchema = z.object({
  productAnalysis: z.any(),
  modelAnalysis: z.any().optional(),
  basicIdea: z.string().optional().default(''),
  preset: z.enum(PRESET_NAMES).optional().default('balanced'),
  modelConfig: z.object({
    preset: z.enum(PRESET_NAMES).optional(),
    ideation: z.string().optional(),
  }).optional(),
});

const SYSTEM_PROMPT = `Kamu adalah Senior Creative Strategist dan Viral Content Creator untuk iklan produk Indonesia.

Berdasarkan analisis produk dan ide dasar dari user, buat 3-5 konsep iklan video yang berbeda dan kreatif.

Setiap konsep harus mencakup:
1. Judul/angle yang menarik
2. Konsep utama (1-2 kalimat)
3. Storyline singkat (3-4 kalimat)
4. Mengapa efektif untuk target audience

Return JSON:
{
  "creativeIdeas": [
    { "title": "...", "concept": "...", "storyline": "...", "why_effective": "..." }
  ]
}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = GenerateCreativeIdeasSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    const { productAnalysis, modelAnalysis, basicIdea, preset, modelConfig } = validation.data;

    // Resolve model — modelConfig.ideation overrides preset
    const resolved = resolvePreset(modelConfig?.preset ?? preset);
    const ideationModel = modelConfig?.ideation ?? resolved.ideation;

    let productContext = `PRODUK: ${productAnalysis.brand || '-'} — ${productAnalysis.category || '-'}
Bentuk: ${productAnalysis.form_factor || '-'}
Manfaat Utama: ${productAnalysis.key_benefit || '-'}
Target: ${productAnalysis.target_audience || '-'}
Warna: ${productAnalysis.color_scheme || '-'}
Style: ${productAnalysis.style || '-'}`;

    if (productAnalysis.notable_text) {
      productContext += `\nTeks Kemasan: ${productAnalysis.notable_text}`;
    }
    if (productAnalysis.additional_notes) {
      productContext += `\nCatatan: ${productAnalysis.additional_notes}`;
    }
    if (modelAnalysis) {
      productContext += `\n\nMODEL: ${modelAnalysis.age_range || '-'}, ${modelAnalysis.gender || '-'}, ${modelAnalysis.ethnicity || '-'}`;
    }

    const userPrompt = `IDE DASAR: "${basicIdea || 'tidak ada'}"

KONTEKS PRODUK:
${productContext}

Buatlah 3-5 ide kreatif iklan video yang berbeda untuk produk ini.`;

    const started = Date.now();
    const res = await withRetry(() =>
      chatCompletion({
        model: ideationModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      })
    );

    logUsage({
      layer: 'ideation',
      model: res.model,
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - started,
      costUsd: res.usage?.total_cost,
      createdAt: new Date(),
    });

    const raw = res.choices[0]?.message?.content ?? '';
    const parsed = parseJson<{ creativeIdeas?: unknown[]; ideas?: unknown[] }>(raw);

    const creativeIdeas =
      parsed.creativeIdeas ??
      parsed.ideas ??
      (Array.isArray(parsed) ? parsed : (Object.values(parsed).find(Array.isArray) ?? []));

    return NextResponse.json({ creativeIdeas });
  } catch (error) {
    return NextResponse.json(
      { error: 'Gagal generate ide kreatif' },
      { status: 500 }
    );
  }
}
