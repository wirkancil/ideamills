import pLimit from 'p-limit';
import { getDb } from '../app/lib/mongoClient';
import { generateImage } from '../app/lib/llm';
import { uploadImageAsset, createVideoJob, waitForVideo } from '../app/lib/useapi';
import { saveImage, downloadAndSaveVideo } from '../app/lib/storage';
import { normalizeImage } from '../app/lib/llm/middleware';
import type { ModelConfig } from '../app/lib/llm';

interface SceneAsset {
  sceneId: string;
  scriptId: string;
  imgPrompt: string;
  vidPrompt: string;
  aspectRatio?: 'landscape' | 'portrait';
}

interface AssetResult {
  sceneId: string;
  imagePath?: string;
  videoPath?: string;
  error?: string;
}

const IMAGE_CONCURRENCY = 3;
const VIDEO_CONCURRENCY = 2;

async function generateAndSaveImage(
  prompt: string,
  genId: string,
  sceneId: string,
  modelConfig: ModelConfig
): Promise<string> {
  const res = await generateImage(prompt, { aspectRatio: '16:9', size: '1K' }, modelConfig, genId);
  const base64 = res.images[0];
  const filename = `${sceneId}.jpg`;
  return saveImage(base64, genId, filename);
}

async function generateAndSaveVideo(
  imagePath: string,
  vidPrompt: string,
  genId: string,
  sceneId: string,
  aspectRatio: 'landscape' | 'portrait' = 'landscape'
): Promise<string> {
  const imageBase64 = await normalizeImage(imagePath);
  const mediaId = await uploadImageAsset(imageBase64);
  const jobId = await createVideoJob({ imageUrl: mediaId, prompt: vidPrompt, aspectRatio });
  const videoUrl = await waitForVideo(jobId);
  const filename = `${sceneId}.mp4`;
  return downloadAndSaveVideo(videoUrl, genId, filename);
}

export async function generateAssets(
  genId: string,
  assets: SceneAsset[],
  modelConfig: ModelConfig,
  onProgress?: (done: number, total: number) => void
): Promise<AssetResult[]> {
  const results: AssetResult[] = [];
  const imgLimit = pLimit(IMAGE_CONCURRENCY);
  const vidLimit = pLimit(VIDEO_CONCURRENCY);

  let done = 0;
  const total = assets.length;

  const tasks = assets.map((asset) =>
    imgLimit(async () => {
      const result: AssetResult = { sceneId: asset.sceneId };

      try {
        const imagePath = await generateAndSaveImage(
          asset.imgPrompt,
          genId,
          asset.sceneId,
          modelConfig
        );
        result.imagePath = imagePath;

        await updateScene(asset.sceneId, { generated_image_path: imagePath });

        if (asset.vidPrompt && process.env.USEAPI_TOKEN) {
          try {
            const videoPath = await vidLimit(() =>
              generateAndSaveVideo(imagePath, asset.vidPrompt, genId, asset.sceneId, asset.aspectRatio)
            );
            result.videoPath = videoPath;
            await updateScene(asset.sceneId, { generated_video_path: videoPath });
          } catch (vidErr) {
            console.warn(`[assets] video failed for scene ${asset.sceneId}:`, (vidErr as Error).message);
          }
        }
      } catch (err) {
        result.error = (err as Error).message;
        console.error(`[assets] scene ${asset.sceneId} failed:`, result.error);
      }

      done++;
      onProgress?.(done, total);
      return result;
    })
  );

  const settled = await Promise.allSettled(tasks);
  settled.forEach((s) => {
    if (s.status === 'fulfilled') results.push(s.value);
  });

  return results;
}

async function updateScene(sceneId: string, fields: Record<string, unknown>): Promise<void> {
  try {
    const db = await getDb();
    const { ObjectId } = await import('mongodb');
    await db.collection('Scenes').updateOne(
      { _id: new ObjectId(sceneId) },
      { $set: { ...fields, updated_at: new Date() } }
    );
  } catch (err) {
    console.warn(`[assets] failed to update scene ${sceneId}:`, (err as Error).message);
  }
}

export async function collectSceneAssets(genId: string): Promise<SceneAsset[]> {
  const db = await getDb();
  const scripts = await db.collection('Scripts').find({ generation_id: genId }).toArray();
  const scriptIds = scripts.map((s) => s._id.toString());

  const scenes = await db.collection('Scenes')
    .find({ script_id: { $in: scriptIds } })
    .sort({ script_id: 1, order: 1 })
    .toArray();

  return scenes
    .filter((s) => s.text_to_image)
    .map((s) => ({
      sceneId: s._id.toString(),
      scriptId: s.script_id,
      imgPrompt: s.text_to_image,
      vidPrompt: s.image_to_video ?? '',
    }));
}
