import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/app/lib/mongoClient';
import { concatenateVideos } from '@/app/lib/useapi';
import { storagePathToUrl } from '@/app/lib/storage';
import type { Clip, ConcatenatedVideo } from '@/app/lib/types';

const RequestSchema = z.object({
  generationId: z.string().min(1),
  clipIndices: z.array(z.number().int().min(0)).min(2).max(10),
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

    const { generationId, clipIndices } = parsed.data;

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

    const selectedClips = clipIndices.map((idx) => {
      const clip = clips.find((c) => c.index === idx);
      if (!clip) throw new Error(`Clip index ${idx} tidak ditemukan`);
      if (clip.video_status !== 'done') throw new Error(`Clip ${idx} belum selesai`);
      if (!clip.media_generation_id) throw new Error(`Clip ${idx} tidak punya mediaGenerationId`);
      return clip;
    });

    const concatId = randomUUID();
    const now = new Date();
    const concatDoc: ConcatenatedVideo = {
      id: concatId,
      clip_indices: clipIndices,
      status: 'generating',
      local_path: null,
      error: null,
      created_at: now,
    };

    await db.collection('Generations').updateOne(
      { _id: oid },
      {
        $push: { concatenated_videos: concatDoc as any },
        $set: { updated_at: now },
      }
    );

    const media = selectedClips.map((clip) => ({
      mediaGenerationId: clip.media_generation_id!,
      ...(clip.is_extended ? { trimStart: 1 } : {}),
    }));

    try {
      const result = await concatenateVideos(media);

      const buffer = Buffer.from(result.encodedVideo, 'base64');
      const storagePath = process.env.STORAGE_PATH ?? path.join(process.cwd(), 'storage');
      const dir = path.join(storagePath, 'videos', generationId);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `concat_${concatId}.mp4`);
      fs.writeFileSync(filePath, buffer);
      const localUrl = storagePathToUrl(filePath);

      await db.collection('Generations').updateOne(
        { _id: oid, 'concatenated_videos.id': concatId },
        {
          $set: {
            'concatenated_videos.$.status': 'done',
            'concatenated_videos.$.local_path': localUrl,
            updated_at: new Date(),
          },
        }
      );

      return NextResponse.json({ concatenatedVideoId: concatId, localPath: localUrl });
    } catch (err) {
      await db.collection('Generations').updateOne(
        { _id: oid, 'concatenated_videos.id': concatId },
        {
          $set: {
            'concatenated_videos.$.status': 'failed',
            'concatenated_videos.$.error': err instanceof Error ? err.message : 'Gagal concatenate',
            updated_at: new Date(),
          },
        }
      );
      throw err;
    }
  } catch (error) {
    console.error('/api/studio/concatenate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
