import fs from 'fs';
import path from 'path';

function storagePath(): string {
  return process.env.STORAGE_PATH ?? path.join(process.cwd(), 'storage');
}

function assetDir(type: 'images' | 'videos', jobId: string): string {
  return path.join(storagePath(), type, jobId);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export async function saveImage(
  base64DataUrl: string,
  jobId: string,
  filename: string
): Promise<string> {
  const dir = assetDir('images', jobId);
  ensureDir(dir);

  const base64 = base64DataUrl.startsWith('data:')
    ? base64DataUrl.split(',')[1]
    : base64DataUrl;

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}

export async function downloadAndSaveVideo(
  videoUrl: string,
  jobId: string,
  filename: string
): Promise<string> {
  const dir = assetDir('videos', jobId);
  ensureDir(dir);

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(`Failed to download video (${res.status}): ${videoUrl}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function resolveStoragePath(type: 'images' | 'videos', jobId: string, filename: string): string {
  return path.join(assetDir(type, jobId), filename);
}

export function storagePathToUrl(absolutePath: string): string {
  const base = storagePath();
  const relative = absolutePath.replace(base, '').replace(/^[\\/]/, '');
  return `/api/storage/${relative.replace(/\\/g, '/')}`;
}
