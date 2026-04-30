import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { resolvePreset, expandToClips } from '@/app/lib/llm';
import type { Clip, Idea, ProductDescription, ModelDescription } from '@/app/lib/types';

const RequestSchema = z.object({
  generationId: z.string().min(1),
  selectedIdeaIndex: z.number().int().min(0),
});

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

    const { generationId, selectedIdeaIndex } = parsed.data;
    let oid: ObjectId;
    try {
      oid = new ObjectId(generationId);
    } catch {
      return NextResponse.json({ error: 'Invalid generationId' }, { status: 400 });
    }

    const db = await getDb();
    const generation = await db.collection('Generations').findOne({ _id: oid });
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    const ideas = (generation.ideas ?? []) as Idea[];
    if (selectedIdeaIndex >= ideas.length) {
      return NextResponse.json({ error: 'selectedIdeaIndex out of range' }, { status: 400 });
    }

    const selectedIdea = ideas[selectedIdeaIndex];
    const productAnalysis = generation.productAnalysis as ProductDescription | undefined;
    const modelAnalysis = (generation.modelAnalysis ?? null) as ModelDescription | null;
    const brief = (generation.brief ?? '') as string;
    const modelConfig = generation.modelConfig ?? resolvePreset('balanced');

    if (!productAnalysis) {
      return NextResponse.json(
        { error: 'Generation missing productAnalysis (run /api/studio/ideas first)' },
        { status: 400 }
      );
    }

    const result = await expandToClips(
      productAnalysis,
      modelAnalysis,
      selectedIdea,
      brief,
      modelConfig as Parameters<typeof expandToClips>[4]
    );

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
      { _id: oid },
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
