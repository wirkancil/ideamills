import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { suggestExtendPrompt } from '@/app/lib/llm';
import type { Clip } from '@/app/lib/types';

const RequestSchema = z.object({
  generationId: z.string().min(1),
  sourceClipIndex: z.number().int().min(0),
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

    const { generationId, sourceClipIndex } = parsed.data;

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

    const clips = (generation.clips ?? []) as Clip[];
    const sourceClip = clips.find((c) => c.index === sourceClipIndex);
    if (!sourceClip) {
      return NextResponse.json({ error: 'Source clip not found' }, { status: 404 });
    }

    const ideas = (generation.ideas ?? []) as Array<{ title: string; content: string }>;
    const selectedIdeaIndex = generation.selectedIdeaIndex as number | null ?? 0;
    const ideaContent = ideas[selectedIdeaIndex]?.content ?? generation.brief ?? '';
    const styleNotes = (generation.styleNotes as string | undefined) ?? '';
    const sourcePrompt = sourceClip.veo_prompt ?? sourceClip.prompt;

    const prompt = await suggestExtendPrompt(sourcePrompt, ideaContent, styleNotes, undefined, { generationId });

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error('/api/studio/suggest-extend-prompt error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
