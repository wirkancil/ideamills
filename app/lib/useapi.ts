const BASE_URL = 'https://api.useapi.net/v1';

function headers(): Record<string, string> {
  const token = process.env.USEAPI_TOKEN;
  if (!token) throw new Error('USEAPI_TOKEN not set');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export interface VideoGenerateOptions {
  imageUrl: string;
  prompt: string;
  aspectRatio?: 'landscape' | 'portrait';
  model?: string;
}

export interface VideoJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}

async function apiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`useapi.net ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}

export async function uploadImageAsset(imageBase64: string, email?: string): Promise<string> {
  const userEmail = email ?? process.env.USEAPI_GOOGLE_EMAIL;
  if (!userEmail) throw new Error('USEAPI_GOOGLE_EMAIL not set');

  const base64Data = imageBase64.startsWith('data:')
    ? imageBase64.split(',')[1]
    : imageBase64;

  const result = await apiRequest<{ mediaGenerationId: string }>(
    'POST',
    `/assets/${encodeURIComponent(userEmail)}`,
    { image: base64Data }
  );

  return result.mediaGenerationId;
}

export async function createVideoJob(opts: VideoGenerateOptions): Promise<string> {
  const result = await apiRequest<{ jobId: string }>(
    'POST',
    '/google-flow/videos',
    {
      mediaGenerationId: opts.imageUrl,
      prompt: opts.prompt,
      model: opts.model ?? 'veo-3.1-fast',
      aspectRatio: opts.aspectRatio ?? 'landscape',
      async: true,
    }
  );
  return result.jobId;
}

export async function pollVideoJob(jobId: string): Promise<VideoJob> {
  const result = await apiRequest<{
    jobId: string;
    status: string;
    video?: { url: string };
    error?: string;
  }>('GET', `/jobs/${jobId}`);

  return {
    jobId: result.jobId,
    status: result.status as VideoJob['status'],
    videoUrl: result.video?.url,
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
