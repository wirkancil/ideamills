import { ObjectId } from 'mongodb';
import { getDb } from '../app/lib/mongoClient';
import { uploadImageAsset, createVideoJob, waitForVideo } from '../app/lib/useapi';
import { generateImage, resolvePreset } from '../app/lib/llm';
import { saveImage, downloadAndSaveVideo, storagePathToUrl } from '../app/lib/storage';
import type { Clip, ClipImageMode } from '../app/lib/types';

// ============================================================
// Worker Entry Point
// ============================================================

interface V2Payload {
  productImageUrl: string;
  modelImageUrl?: string | null;
  basicIdea?: string;
  storyboardCount: number;
  product: unknown;
  model: unknown | null;
  v2Studio: true;
  v2RegenerateClipIndex?: number;
}

const CLIP_CONCURRENCY = 2;

/**
 * Worker entry point. Only v2 Studio Clean Flow is supported.
 * Legacy v1 payloads will be marked failed.
 */
export async function runGeneration(genId: string, payload: unknown) {
  if ((payload as Record<string, unknown> | null)?.v2Studio === true) {
    await runV2StudioGeneration(genId, payload as V2Payload);
    return;
  }

  // Unsupported payload — mark generation failed so user is notified
  const db = await getDb();
  let oid: ObjectId | null = null;
  try {
    oid = new ObjectId(genId);
  } catch {
    /* invalid id — nothing to update */
  }
  if (oid) {
    await db.collection('Generations').updateOne(
      { _id: oid },
      {
        $set: {
          status: 'failed',
          progress: 100,
          error_message: 'Generation menggunakan format lama yang sudah tidak didukung. Buat generation baru di Studio.',
          updated_at: new Date(),
        },
      }
    );
  }

  throw new Error(`Unsupported job payload — only v2 studio generation is supported.`);
}

// ============================================================
// V2 Studio Pipeline
// ============================================================

async function runV2StudioGeneration(generationId: string, payload: V2Payload) {
  const db = await getDb();
  const oid = new ObjectId(generationId);

  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        status: 'processing',
        progress: 10,
        progress_label: 'Memulai generation',
        updated_at: new Date(),
      },
    }
  );

  const gen = await db.collection('Generations').findOne({ _id: oid });
  if (!gen) throw new Error(`Generation ${generationId} not found`);

  const styleNotes = (gen.styleNotes ?? '') as string;
  const allClips = (gen.clips ?? []) as Clip[];
  const productImageUrl = gen.product_image_url as string;
  const modelConfig = gen.modelConfig ?? resolvePreset('balanced');
  const veoModel = (gen.veo_model as string | undefined) ?? 'veo-3.1-fast';

  const clipsToProcess =
    typeof payload.v2RegenerateClipIndex === 'number'
      ? allClips.filter((c) => c.index === payload.v2RegenerateClipIndex)
      : allClips;

  if (clipsToProcess.length === 0) {
    await db.collection('Generations').updateOne(
      { _id: oid },
      {
        $set: {
          status: 'failed',
          progress: 100,
          progress_label: 'Tidak ada clip untuk diproses',
          updated_at: new Date(),
        },
      }
    );
    return;
  }

  await processWithConcurrency(clipsToProcess, CLIP_CONCURRENCY, async (clip) => {
    try {
      await generateClipAssets(generationId, clip, styleNotes, productImageUrl, modelConfig, veoModel);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await db.collection('Generations').updateOne(
        { _id: oid },
        {
          $set: {
            'clips.$[c].video_status': 'failed',
            'clips.$[c].video_error': errMsg,
            'clips.$[c].updated_at': new Date(),
          },
        },
        { arrayFilters: [{ 'c.index': clip.index }] }
      );
    }
  });

  // Determine final status from current clip state in DB
  const refreshed = await db.collection('Generations').findOne({ _id: oid });
  const clipsAfter = (refreshed?.clips ?? []) as Clip[];
  const totalClips = clipsAfter.length;
  const successCount = clipsAfter.filter((c) => c.video_status === 'done').length;
  const allDone = clipsAfter.every((c) => c.video_status === 'done');
  const anyFailed = clipsAfter.some((c) => c.video_status === 'failed');

  const finalStatus = allDone ? 'completed' : anyFailed ? 'partial' : 'failed';

  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        status: finalStatus,
        progress: 100,
        progress_label: `${successCount}/${totalClips} clip selesai`,
        updated_at: new Date(),
      },
    }
  );
}

// ============================================================
// Per-Clip Asset Generation
// ============================================================

async function generateClipAssets(
  generationId: string,
  clip: Clip,
  styleNotes: string,
  productImageUrl: string,
  modelConfig: unknown,
  veoModel: string
) {
  const db = await getDb();
  const oid = new ObjectId(generationId);
  const arrayFilters = [{ 'c.index': clip.index }];

  // Step 1: Resolve image source
  await db.collection('Generations').updateOne(
    { _id: oid },
    { $set: { 'clips.$[c].image_status': 'generating', 'clips.$[c].updated_at': new Date() } },
    { arrayFilters }
  );

  let imageData: string;
  const mode: ClipImageMode = clip.imageMode;
  if (mode === 'inherit') {
    imageData = productImageUrl;
  } else if (mode === 'override') {
    if (!clip.imageDataUrl) throw new Error('imageMode=override missing imageDataUrl');
    imageData = clip.imageDataUrl;
  } else {
    // ai-generate: build image prompt with style notes + clip prompt
    const imagePrompt = styleNotes ? `${styleNotes}\n\n${clip.prompt}` : clip.prompt;
    const imgRes = await generateImage(
      imagePrompt,
      { aspectRatio: '16:9' },
      modelConfig as Parameters<typeof generateImage>[2],
      generationId
    );
    imageData = imgRes.images[0];
    const imageFilePath = await saveImage(imageData, generationId, `clip-${clip.index}.jpg`);
    const imagePublicUrl = storagePathToUrl(imageFilePath);
    await db.collection('Generations').updateOne(
      { _id: oid },
      { $set: { 'clips.$[c].generated_image_path': imagePublicUrl } },
      { arrayFilters }
    );
  }

  // Upload image to useapi.net for Veo input
  const mediaGenerationId = await uploadImageAsset(imageData);
  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        'clips.$[c].image_status': 'done',
        'clips.$[c].media_generation_id': mediaGenerationId,
        'clips.$[c].updated_at': new Date(),
      },
    },
    { arrayFilters }
  );

  // Step 2: Veo image-to-video
  await db.collection('Generations').updateOne(
    { _id: oid },
    { $set: { 'clips.$[c].video_status': 'queued' } },
    { arrayFilters }
  );

  const finalPrompt = styleNotes ? `${styleNotes}\n\n${clip.prompt}` : clip.prompt;
  const veoJobId = await createVideoJob({
    imageUrl: mediaGenerationId,
    prompt: finalPrompt,
    model: veoModel,
    aspectRatio: 'landscape',
  });

  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        'clips.$[c].video_status': 'generating',
        'clips.$[c].video_job_id': veoJobId,
      },
    },
    { arrayFilters }
  );

  const videoUrl = await waitForVideo(veoJobId);
  const videoFilePath = await downloadAndSaveVideo(videoUrl, generationId, `clip-${clip.index}.mp4`);
  const videoPublicUrl = storagePathToUrl(videoFilePath);

  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        'clips.$[c].video_status': 'done',
        'clips.$[c].generated_video_path': videoPublicUrl,
        'clips.$[c].updated_at': new Date(),
      },
    },
    { arrayFilters }
  );
}

// ============================================================
// Concurrency Helper
// ============================================================

async function processWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
