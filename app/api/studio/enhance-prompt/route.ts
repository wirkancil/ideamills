import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolvePreset, enhanceVeoPrompt } from '@/app/lib/llm';

const RequestSchema = z.object({
  prompt: z.string().min(10).max(3000),
  textModel: z.string().optional(),
});

// Negation pattern detection (Indonesian + English).
const NEGATION_RE = /\b(no|not|tidak|tanpa|bukan|jangan|nor|none)\b/i;

// Stronger pattern that catches "no X" phrases (the actual problem cases for Veo).
// Won't match "no" inside larger words ("number", "now") because of \b.
const ACTIVE_NEGATION_RE = /\b(no|not|tidak|tanpa|bukan|jangan)\s+\w+/gi;

function countActiveNegations(text: string): number {
  return (text.match(ACTIVE_NEGATION_RE) ?? []).length;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { prompt, textModel } = parsed.data;

    // Skip LLM call if no negation detected — return original verbatim.
    if (!NEGATION_RE.test(prompt)) {
      return NextResponse.json({
        enhanced: prompt,
        skipped: true,
        reason: 'Tidak ada negation di prompt — tidak ada yang perlu di-flip.',
      });
    }

    const baseConfig = resolvePreset('fast');
    // Use user's textModel if provided, otherwise GLM-4.7 (free).
    const config = textModel
      ? { ...baseConfig, expand: textModel }
      : baseConfig;

    const inputNegations = countActiveNegations(prompt);

    let enhanced = await enhanceVeoPrompt(prompt, config);

    // Safety guard 1: length drift.
    const inputLen = prompt.trim().length;
    const outputLen = enhanced.trim().length;
    const ratio = outputLen / inputLen;

    if (ratio > 1.25 || ratio < 0.75) {
      console.warn(
        `[enhance] Length drift detected (ratio ${ratio.toFixed(2)}, in=${inputLen} out=${outputLen}). Returning original.`
      );
      return NextResponse.json({
        enhanced: prompt,
        skipped: true,
        reason: `LLM mengubah terlalu banyak (output ${(ratio * 100).toFixed(0)}% dari input). Original dikembalikan untuk safety.`,
      });
    }

    // Safety guard 2: leftover negation detection.
    // If LLM didn't fully flip negation, return original (user can manually edit).
    const outputNegations = countActiveNegations(enhanced);
    if (outputNegations > 0 && outputNegations >= inputNegations) {
      console.warn(
        `[enhance] Leftover negation detected (in=${inputNegations}, out=${outputNegations}). Returning original.`
      );
      return NextResponse.json({
        enhanced: prompt,
        skipped: true,
        reason: `LLM gagal flip semua negation (${outputNegations} tersisa). Original dikembalikan — edit manual atau coba model lain di Pengaturan.`,
      });
    }

    return NextResponse.json({ enhanced });
  } catch (error) {
    console.error('/api/studio/enhance-prompt error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
