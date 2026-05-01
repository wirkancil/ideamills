const BASE_URL = 'https://api.useapi.net/v1';

function authHeader(): { Authorization: string } {
  const token = process.env.USEAPI_TOKEN;
  if (!token) throw new Error('USEAPI_TOKEN not set');
  return { Authorization: `Bearer ${token}` };
}

export interface VideoGenerateOptions {
  imageUrl: string;             // mediaGenerationId from uploadImageAsset(), used as startImage
  prompt: string;
  aspectRatio?: 'landscape' | 'portrait';
  model?: string;
  email?: string;
  referenceImageUrls?: string[]; // 0–3 mediaGenerationIds, mapped to referenceImage_1..3
}

export interface VideoJob {
  jobId: string;
  status: 'created' | 'started' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}

async function jsonRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes('PROMINENT_PEOPLE')) {
      throw new Error('Prompt atau foto ditolak oleh Google karena mengandung deskripsi atau wajah yang teridentifikasi. Coba sederhanakan deskripsi model, atau ganti foto dengan yang lain.');
    }
    throw new Error(`useapi.net ${res.status} ${path}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

function detectMimeFromDataUrl(input: string): string {
  if (!input.startsWith('data:')) return 'image/jpeg';
  const match = input.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'image/jpeg';
}

function stripDataUrlPrefix(input: string): string {
  return input.startsWith('data:') ? input.split(',', 2)[1] : input;
}

/**
 * Upload an image to Google Flow assets via useapi.net.
 * Image input may be a data URL (`data:image/jpeg;base64,...`) or raw base64.
 * Returns the nested `mediaGenerationId` string for use as `startImage` in createVideoJob.
 */
export async function uploadImageAsset(imageBase64: string, email?: string): Promise<string> {
  const userEmail = email ?? process.env.USEAPI_GOOGLE_EMAIL;
  if (!userEmail) throw new Error('USEAPI_GOOGLE_EMAIL not set');

  const mime = detectMimeFromDataUrl(imageBase64);
  const buffer = Buffer.from(stripDataUrlPrefix(imageBase64), 'base64');

  const res = await fetch(
    `${BASE_URL}/google-flow/assets/${encodeURIComponent(userEmail)}`,
    {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': mime },
      body: new Uint8Array(buffer),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    if (text.includes('PROMINENT_PEOPLE')) {
      throw new Error('Foto model ditolak oleh Google karena mengandung wajah yang teridentifikasi. Coba gunakan foto dengan wajah yang tidak terlalu jelas, atau ganti dengan foto lain.');
    }
    throw new Error(`useapi.net ${res.status} upload: ${text.slice(0, 300)}`);
  }

  const result = (await res.json()) as {
    mediaGenerationId?: { mediaGenerationId?: string };
  };
  const id = result.mediaGenerationId?.mediaGenerationId;
  if (!id) throw new Error('useapi.net upload: missing mediaGenerationId in response');
  return id;
}

export async function createVideoJob(opts: VideoGenerateOptions): Promise<string> {
  const userEmail = opts.email ?? process.env.USEAPI_GOOGLE_EMAIL;
  if (!userEmail) throw new Error('USEAPI_GOOGLE_EMAIL not set');

  const refs = opts.referenceImageUrls ?? [];
  const referenceFields: Record<string, string> = {};
  if (refs[0]) referenceFields.referenceImage_1 = refs[0];
  if (refs[1]) referenceFields.referenceImage_2 = refs[1];
  if (refs[2]) referenceFields.referenceImage_3 = refs[2];

  const result = await jsonRequest<{ jobid: string }>(
    'POST',
    '/google-flow/videos',
    {
      email: userEmail,
      prompt: opts.prompt,
      model: opts.model ?? 'veo-3.1-fast',
      aspectRatio: opts.aspectRatio ?? 'landscape',
      startImage: opts.imageUrl,
      async: true,
      ...referenceFields,
    }
  );
  return result.jobid;
}

interface RawJobResponse {
  jobid: string;
  status: string;
  response?: {
    media?: Array<{
      videoUrl?: string;
      thumbnailUrl?: string;
    }>;
  };
  error?: string;
}

export async function pollVideoJob(jobId: string): Promise<VideoJob> {
  const result = await jsonRequest<RawJobResponse>('GET', `/google-flow/jobs/${jobId}`);
  const videoUrl = result.response?.media?.[0]?.videoUrl;
  return {
    jobId: result.jobid,
    status: result.status as VideoJob['status'],
    videoUrl,
    error: result.error,
  };
}

const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export async function waitForVideo(jobId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const job = await pollVideoJob(jobId);

    if (job.status === 'completed' && job.videoUrl) {
      return job.videoUrl;
    }
    if (job.status === 'failed') {
      throw new Error(`Video job ${jobId} failed: ${job.error ?? 'unknown'}`);
    }
  }

  throw new Error(`Video job ${jobId} timed out after 10 minutes`);
}

export interface ImageGenerateOptions {
  prompt: string;
  model?: 'imagen-4' | 'nano-banana-2' | 'nano-banana-pro';
  aspectRatio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  count?: 1 | 2 | 3 | 4;
  email?: string;
}

export interface ImageGenerateResult {
  jobId: string;
  imageUrl: string;
  mediaGenerationId: string;
}

interface RawImageResponse {
  jobId: string;
  media?: Array<{
    image?: {
      generatedImage?: {
        mediaGenerationId?: string;
        fifeUrl?: string;
      };
    };
  }>;
}

/**
 * Generate image via useapi.net Google Flow.
 * Endpoint: POST /google-flow/images
 */
export async function generateImage(opts: ImageGenerateOptions): Promise<ImageGenerateResult> {
  const userEmail = opts.email ?? process.env.USEAPI_GOOGLE_EMAIL;
  if (!userEmail) throw new Error('USEAPI_GOOGLE_EMAIL not set');

  const result = await jsonRequest<RawImageResponse>(
    'POST',
    '/google-flow/images',
    {
      email: userEmail,
      prompt: opts.prompt,
      model: opts.model ?? 'imagen-4',
      aspectRatio: opts.aspectRatio ?? '16:9',
      count: opts.count ?? 1,
    }
  );

  const first = result.media?.[0]?.image?.generatedImage;
  const imageUrl = first?.fifeUrl;
  const mediaGenerationId = first?.mediaGenerationId;
  if (!imageUrl || !mediaGenerationId) {
    throw new Error('useapi.net image: missing fifeUrl/mediaGenerationId in response');
  }

  return {
    jobId: result.jobId,
    imageUrl,
    mediaGenerationId,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
