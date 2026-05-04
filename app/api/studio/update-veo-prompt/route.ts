import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';

const RequestSchema = z.object({
  generationId: z.string().min(1),
  clipIndex: z.number().int().min(0),
  veoPrompt: z.string().min(5).max(3000),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.format() }, { status: 400 });
    }

    const { generationId, clipIndex, veoPrompt } = parsed.data;

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
    const clips = (generation.clips ?? []) as Array<{ index: unknown }>;
    if (!clips.find((c) => c.index === clipIndex || c.index === String(clipIndex))) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    const result = await db.collection('Generations').updateOne(
      { _id: oid },
      { $set: { 'clips.$[c].veo_prompt': veoPrompt, 'clips.$[c].updated_at': new Date() } },
      { arrayFilters: [{ 'c.index': clipIndex }] }
    );

    if (result.modifiedCount === 0) {
      const gen = await db.collection('Generations').findOne({ _id: oid });
      const rawClips = (gen?.clips ?? []) as Array<Record<string, unknown>>;
      const updatedClips = rawClips.map((c) =>
        c.index === clipIndex || c.index === String(clipIndex)
          ? { ...c, veo_prompt: veoPrompt, updated_at: new Date() }
          : c
      );
      await db.collection('Generations').updateOne(
        { _id: oid },
        { $set: { clips: updatedClips } }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('/api/studio/update-veo-prompt error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
