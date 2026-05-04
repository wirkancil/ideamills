# Video Extend & Concatenate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah fitur Extend dan Concatenate video di halaman History — user bisa perpanjang clip yang sudah ada, generate prompt extension via AI, dan gabungkan multiple clips menjadi 1 video.

**Architecture:** Extended clips disimpan sebagai `Clip` baru di array `clips[]` generation (field `is_extended`, `extended_from_index`). Concatenated videos disimpan sebagai array `concatenated_videos[]` di generation. Tiga API route baru: `extend-clip`, `suggest-extend-prompt`, `concatenate`. UI extend via modal di `ClipResults.tsx`, UI concatenate via mode seleksi di `GenerationHistory.tsx`.

**Tech Stack:** Next.js App Router (API routes), MongoDB (via `getDb()`), useapi.net (`app/lib/useapi.ts`), OpenRouter via LLM lib (`app/lib/llm`), React + Tailwind + shadcn/ui, Vitest untuk unit tests.

---

## File Map

| File | Aksi | Tanggung Jawab |
|---|---|---|
| `app/lib/types.ts` | Modify | Tambah field `is_extended`, `extended_from_index` ke `Clip`; tambah `ConcatenatedVideo`; tambah `concatenated_videos` ke `DBGeneration` |
| `app/lib/useapi.ts` | Modify | Tambah `extendVideo()` dan `concatenateVideos()` |
| `app/lib/llm/prompts.ts` | Modify | Tambah `SUGGEST_EXTEND_SYSTEM` dan `SUGGEST_EXTEND_USER` |
| `app/lib/llm/index.ts` | Modify | Tambah `suggestExtendPrompt()` |
| `app/api/studio/extend-clip/route.ts` | Create | Endpoint POST extend clip |
| `app/api/studio/suggest-extend-prompt/route.ts` | Create | Endpoint POST suggest prompt |
| `app/api/studio/concatenate/route.ts` | Create | Endpoint POST concatenate |
| `app/lib/__tests__/useapi-extend.test.ts` | Create | Unit test `extendVideo()` dan `concatenateVideos()` |
| `app/components/ClipResults.tsx` | Modify | Tambah tombol Extend + modal |
| `app/components/GenerationHistory.tsx` | Modify | Tambah mode seleksi + tombol Gabungkan + card hasil concatenate |

---

## Task 1: Update Types

**Files:**
- Modify: `app/lib/types.ts`

- [ ] **Step 1: Tambah field ke `Clip` dan `DBGeneration`, serta interface `ConcatenatedVideo`**

Buka `app/lib/types.ts`. Ubah interface `Clip` (sekitar baris 111) dengan menambah 2 field setelah `video_job_id`:

```ts
export interface Clip {
  index: number;
  prompt: string;
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;
  generated_image_path?: string | null;
  generated_video_path?: string | null;
  image_status: AssetStatus;
  video_status: AssetStatus;
  image_error?: string | null;
  video_error?: string | null;
  media_generation_id?: string | null;
  video_job_id?: string | null;
  is_extended?: boolean;                 // true jika clip ini hasil extend
  extended_from_index?: number | null;   // index clip sumber
  created_at: Date;
  updated_at?: Date;
}
```

Tambah interface `ConcatenatedVideo` setelah interface `Clip`:

```ts
export interface ConcatenatedVideo {
  id: string;
  clip_indices: number[];
  status: 'generating' | 'done' | 'failed';
  local_path?: string | null;
  error?: string | null;
  created_at: Date;
}
```

Tambah field `concatenated_videos` ke `DBGeneration` setelah field `clips`:

```ts
clips?: Clip[];
concatenated_videos?: ConcatenatedVideo[];
```

- [ ] **Step 2: Verify TypeScript compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills && npx tsc --noEmit -p tsconfig.minimal.json 2>&1 | head -30
```

Expected: tidak ada error terkait `types.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/lib/types.ts
git commit -m "feat: tambah ConcatenatedVideo type dan field extend ke Clip"
```

---

## Task 2: Tambah `extendVideo()` dan `concatenateVideos()` ke useapi.ts

**Files:**
- Modify: `app/lib/useapi.ts`
- Create: `app/lib/__tests__/useapi-extend.test.ts`

- [ ] **Step 1: Tulis failing test**

Buat file `app/lib/__tests__/useapi-extend.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Set env vars
vi.stubEnv('USEAPI_TOKEN', 'test-token');
vi.stubEnv('USEAPI_GOOGLE_EMAIL', 'test@example.com');

describe('extendVideo', () => {
  beforeEach(() => vi.resetAllMocks());

  it('calls /google-flow/videos/extend dengan mediaGenerationId dan prompt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobid: 'job-ext-123' }),
    });

    const { extendVideo } = await import('../useapi');
    const jobId = await extendVideo({
      mediaGenerationId: 'media-abc',
      prompt: 'Camera pans right',
    });

    expect(jobId).toBe('job-ext-123');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.useapi.net/v1/google-flow/videos/extend',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"mediaGenerationId":"media-abc"'),
      })
    );
  });

  it('throw error jika response tidak ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    });

    const { extendVideo } = await import('../useapi');
    await expect(extendVideo({ mediaGenerationId: 'x', prompt: 'y' })).rejects.toThrow('useapi.net 400');
  });
});

describe('concatenateVideos', () => {
  beforeEach(() => vi.resetAllMocks());

  it('calls /google-flow/videos/concatenate dan returns base64', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobId: 'concat-job-1',
        status: 'MEDIA_GENERATION_STATUS_SUCCESSFUL',
        inputsCount: 2,
        encodedVideo: 'base64videocontent',
      }),
    });

    const { concatenateVideos } = await import('../useapi');
    const result = await concatenateVideos([
      { mediaGenerationId: 'media-1' },
      { mediaGenerationId: 'media-2', trimStart: 1 },
    ]);

    expect(result.encodedVideo).toBe('base64videocontent');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.useapi.net/v1/google-flow/videos/concatenate',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

- [ ] **Step 2: Run test, pastikan FAIL**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills && npx vitest run app/lib/__tests__/useapi-extend.test.ts 2>&1 | tail -20
```

Expected: FAIL dengan "extendVideo is not a function" atau similar.

- [ ] **Step 3: Implementasi `extendVideo()` dan `concatenateVideos()` di `useapi.ts`**

Tambah di akhir `app/lib/useapi.ts`, sebelum fungsi `sleep`:

```ts
export interface ExtendVideoOptions {
  mediaGenerationId: string;
  prompt: string;
  model?: string;
  email?: string;
}

export async function extendVideo(opts: ExtendVideoOptions): Promise<string> {
  const result = await jsonRequest<{ jobid: string }>(
    'POST',
    '/google-flow/videos/extend',
    {
      mediaGenerationId: opts.mediaGenerationId,
      prompt: opts.prompt,
      model: opts.model ?? 'veo-3.1-fast',
      async: true,
    }
  );
  return result.jobid;
}

export interface ConcatenateMediaItem {
  mediaGenerationId: string;
  trimStart?: number;
}

export interface ConcatenateResult {
  jobId: string;
  encodedVideo: string;
}

export async function concatenateVideos(media: ConcatenateMediaItem[]): Promise<ConcatenateResult> {
  const result = await jsonRequest<ConcatenateResult>(
    'POST',
    '/google-flow/videos/concatenate',
    { media }
  );
  return result;
}
```

- [ ] **Step 4: Run test, pastikan PASS**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills && npx vitest run app/lib/__tests__/useapi-extend.test.ts 2>&1 | tail -20
```

Expected: PASS semua test.

- [ ] **Step 5: Commit**

```bash
git add app/lib/useapi.ts app/lib/__tests__/useapi-extend.test.ts
git commit -m "feat: tambah extendVideo dan concatenateVideos ke useapi.ts"
```

---

## Task 3: Tambah `suggestExtendPrompt()` ke LLM lib

**Files:**
- Modify: `app/lib/llm/prompts.ts`
- Modify: `app/lib/llm/index.ts`

- [ ] **Step 1: Tambah prompt constants ke `prompts.ts`**

Tambah di akhir `app/lib/llm/prompts.ts`:

```ts
export const SUGGEST_EXTEND_SYSTEM = `You are a video continuation prompt writer for Google Veo.
Given a video clip prompt, write ONE continuation prompt that visually extends the scene naturally.
Rules:
- Write in English only
- Keep the same subject, setting, and visual style
- Describe motion and action, not static states
- Maximum 200 words
- Return ONLY the prompt text, no explanation, no quotes`;

export const SUGGEST_EXTEND_USER = (sourcePrompt: string, brief: string) =>
  `Brief idea: ${brief}\n\nSource clip prompt:\n${sourcePrompt}\n\nWrite the continuation prompt:`;
```

- [ ] **Step 2: Tambah `suggestExtendPrompt()` ke `index.ts`**

Import prompt baru di `app/lib/llm/index.ts`. Cari baris import dari `./prompts` dan tambah `SUGGEST_EXTEND_SYSTEM` dan `SUGGEST_EXTEND_USER`:

```ts
import {
  VISION_COMBINED_PROMPT,
  IDEAS_SYSTEM,
  IDEAS_USER,
  EXPAND_SYSTEM,
  EXPAND_USER,
  ENHANCE_PROMPT_SYSTEM,
  ENHANCE_PROMPT_USER,
  SUGGEST_EXTEND_SYSTEM,
  SUGGEST_EXTEND_USER,
} from './prompts';
```

Tambah fungsi di akhir `app/lib/llm/index.ts`:

```ts
export async function suggestExtendPrompt(
  sourcePrompt: string,
  brief: string,
  config?: Partial<ModelConfig>,
  ctx?: { jobId?: string; generationId?: string }
): Promise<string> {
  const { expand } = cfg(config);
  const result = await chat<string>(
    ctx,
    'expand',
    expand,
    [
      { role: 'system', content: SUGGEST_EXTEND_SYSTEM },
      { role: 'user', content: SUGGEST_EXTEND_USER(sourcePrompt, brief) },
    ],
    { maxTokens: 500, timeoutMs: 30_000 }
  );
  const prompt = (result as string).trim();
  if (!prompt) {
    throw new LLMError('Empty extend prompt suggestion', 'INVALID_RESPONSE', 'openrouter', expand);
  }
  return prompt;
}
```

- [ ] **Step 3: Verify TypeScript compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills && npx tsc --noEmit -p tsconfig.minimal.json 2>&1 | head -30
```

Expected: tidak ada error.

- [ ] **Step 4: Commit**

```bash
git add app/lib/llm/prompts.ts app/lib/llm/index.ts
git commit -m "feat: tambah suggestExtendPrompt ke LLM lib"
```

---

## Task 4: API Route `POST /api/studio/suggest-extend-prompt`

**Files:**
- Create: `app/api/studio/suggest-extend-prompt/route.ts`

- [ ] **Step 1: Buat route**

Buat `app/api/studio/suggest-extend-prompt/route.ts`:

```ts
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

    const brief = generation.brief ?? '';
    const prompt = await suggestExtendPrompt(sourceClip.prompt, brief, undefined, { generationId });

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error('/api/studio/suggest-extend-prompt error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills && npx tsc --noEmit -p tsconfig.minimal.json 2>&1 | head -30
```

Expected: tidak ada error.

- [ ] **Step 3: Commit**

```bash
git add app/api/studio/suggest-extend-prompt/route.ts
git commit -m "feat: API route suggest-extend-prompt"
```

---

## Task 5: API Route `POST /api/studio/extend-clip`

**Files:**
- Create: `app/api/studio/extend-clip/route.ts`

- [ ] **Step 1: Buat route**

Buat `app/api/studio/extend-clip/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/app/lib/mongoClient';
import { extendVideo } from '@/app/lib/useapi';
import type { Clip } from '@/app/lib/types';

const RequestSchema = z.object({
  generationId: z.string().min(1),
  sourceClipIndex: z.number().int().min(0),
  prompt: z.string().min(5).max(2000),
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

    const { generationId, sourceClipIndex, prompt } = parsed.data;

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
    if (sourceClip.video_status !== 'done') {
      return NextResponse.json({ error: 'Source clip video belum selesai' }, { status: 400 });
    }
    if (!sourceClip.media_generation_id) {
      return NextResponse.json({ error: 'Source clip tidak punya mediaGenerationId' }, { status: 400 });
    }

    // Call useapi extend
    const jobId = await extendVideo({
      mediaGenerationId: sourceClip.media_generation_id,
      prompt,
    });

    // Buat clip baru
    const newIndex = clips.length;
    const now = new Date();
    const newClip: Clip = {
      index: newIndex,
      prompt,
      imageMode: 'inherit',
      generated_image_path: null,
      generated_video_path: null,
      image_status: 'done',   // extend tidak butuh generate image
      video_status: 'queued',
      image_error: null,
      video_error: null,
      media_generation_id: null,
      video_job_id: jobId,
      is_extended: true,
      extended_from_index: sourceClipIndex,
      created_at: now,
      updated_at: now,
    };

    await db.collection('Generations').updateOne(
      { _id: oid },
      {
        $push: { clips: newClip as any },
        $set: { updated_at: now },
      }
    );

    return NextResponse.json({ clipIndex: newIndex });
  } catch (error) {
    console.error('/api/studio/extend-clip error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills && npx tsc --noEmit -p tsconfig.minimal.json 2>&1 | head -30
```

Expected: tidak ada error.

- [ ] **Step 3: Commit**

```bash
git add app/api/studio/extend-clip/route.ts
git commit -m "feat: API route extend-clip"
```

---

## Task 6: API Route `POST /api/studio/concatenate`

**Files:**
- Create: `app/api/studio/concatenate/route.ts`

- [ ] **Step 1: Buat route**

Buat `app/api/studio/concatenate/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDb } from '@/app/lib/mongoClient';
import { concatenateVideos } from '@/app/lib/useapi';
import { downloadAndSaveVideo } from '@/app/lib/storage';
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

    // Validasi semua clips yang dipilih
    const selectedClips = clipIndices.map((idx) => {
      const clip = clips.find((c) => c.index === idx);
      if (!clip) throw new Error(`Clip index ${idx} tidak ditemukan`);
      if (clip.video_status !== 'done') throw new Error(`Clip ${idx} belum selesai`);
      if (!clip.media_generation_id) throw new Error(`Clip ${idx} tidak punya mediaGenerationId`);
      return clip;
    });

    // Buat ConcatenatedVideo dengan status generating
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

    // Build media array untuk useapi — extended clips dapat trimStart: 1
    const media = selectedClips.map((clip) => ({
      mediaGenerationId: clip.media_generation_id!,
      ...(clip.is_extended ? { trimStart: 1 } : {}),
    }));

    try {
      const result = await concatenateVideos(media);

      // Decode base64 dan simpan ke storage
      const videoDataUrl = `data:video/mp4;base64,${result.encodedVideo}`;
      const filename = `concat_${concatId}.mp4`;

      // Simpan langsung dari base64 buffer
      const buffer = Buffer.from(result.encodedVideo, 'base64');
      const fs = await import('fs');
      const path = await import('path');
      const storagePath = process.env.STORAGE_PATH ?? path.join(process.cwd(), 'storage');
      const dir = path.join(storagePath, 'videos', generationId);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, filename);
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
      // Update status failed
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
```

- [ ] **Step 2: Verify TypeScript compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills && npx tsc --noEmit -p tsconfig.minimal.json 2>&1 | head -30
```

Expected: tidak ada error.

- [ ] **Step 3: Commit**

```bash
git add app/api/studio/concatenate/route.ts
git commit -m "feat: API route concatenate videos"
```

---

## Task 7: Worker — pastikan extended clips di-poll

**Files:**
- Modify: `worker/` (cek file worker yang menangani video polling)

- [ ] **Step 1: Cek file worker video polling**

```bash
ls /Users/mac/Documents/Bharata-AI/ideamills/worker/ && grep -rn "video_status\|video_job_id\|queued" /Users/mac/Documents/Bharata-AI/ideamills/worker --include="*.ts" -l
```

- [ ] **Step 2: Pastikan query worker tidak filter `is_extended`**

Buka file worker yang menangani polling video. Cari query yang mencari clips dengan `video_status: 'queued'`. Pastikan tidak ada filter yang mengecualikan `is_extended: true`. Jika ada kondisi seperti:

```ts
clips.filter(c => c.video_status === 'queued' && !c.is_extended)
```

Hapus `&& !c.is_extended` agar extended clips juga di-poll.

Jika tidak ada filter tersebut, tidak perlu perubahan. Catat hasilnya.

- [ ] **Step 3: Cek apakah worker menyimpan `media_generation_id` dari hasil video**

Cari di worker bagaimana `media_generation_id` disimpan setelah video selesai. Extended clips membutuhkan `media_generation_id` dari hasil extend agar bisa di-extend lagi.

Pastikan setelah `pollVideoJob` sukses, worker menyimpan `mediaGenerationId` dari response ke field `media_generation_id` clip. Jika belum, tambahkan update tersebut.

- [ ] **Step 4: Commit jika ada perubahan**

```bash
git add worker/
git commit -m "fix: worker poll extended clips dan simpan mediaGenerationId"
```

Jika tidak ada perubahan, skip step ini.

---

## Task 8: UI — Modal Extend di `ClipResults.tsx`

**Files:**
- Modify: `app/components/ClipResults.tsx`

- [ ] **Step 1: Tambah state dan handler untuk modal extend**

Di dalam `ClipResults` component, setelah state yang sudah ada, tambah:

```ts
const [extendingClip, setExtendingClip] = useState<Clip | null>(null);
const [extendPrompt, setExtendPrompt] = useState('');
const [suggestingPrompt, setSuggestingPrompt] = useState(false);
const [submittingExtend, setSubmittingExtend] = useState(false);

const handleSuggestPrompt = async (clip: Clip) => {
  setSuggestingPrompt(true);
  try {
    const res = await fetch('/api/studio/suggest-extend-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId, sourceClipIndex: clip.index }),
    });
    if (!res.ok) throw new Error('Gagal generate prompt');
    const data = await res.json();
    setExtendPrompt(data.prompt);
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Gagal generate prompt');
  } finally {
    setSuggestingPrompt(false);
  }
};

const handleExtend = async () => {
  if (!extendingClip || !extendPrompt.trim()) return;
  setSubmittingExtend(true);
  try {
    const res = await fetch('/api/studio/extend-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationId,
        sourceClipIndex: extendingClip.index,
        prompt: extendPrompt.trim(),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Gagal extend');
    }
    setExtendingClip(null);
    setExtendPrompt('');
    onClipUpdated?.();
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Gagal extend video');
  } finally {
    setSubmittingExtend(false);
  }
};
```

- [ ] **Step 2: Tambah import ikon dan komponen modal**

Tambah ke import lucide-react yang sudah ada: `Expand` (atau `ArrowRight`).

Tambah import `Textarea` dari shadcn jika belum ada:
```ts
import { Textarea } from './ui/textarea';
```

- [ ] **Step 3: Tambah badge "Extended" ke ClipStatusBadge area dan tombol Extend ke action bar**

Di bagian render setiap clip (dalam `clips.map`), pada div `flex items-center justify-between`:

```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
    <div className="font-semibold text-sm">
      {clip.is_extended ? `Extended (dari Clip ${(clip.extended_from_index ?? 0) + 1})` : `Clip ${idx + 1}`}
    </div>
    {clip.is_extended && (
      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700">Extended</span>
    )}
  </div>
  <ClipStatusBadge status={clip.video_status} />
</div>
```

Di bagian `<div className="flex gap-2">` (action bar), tambah tombol Extend setelah tombol Download:

```tsx
{clip.video_status === 'done' && (
  <Button
    size="sm"
    variant="outline"
    onClick={() => {
      setExtendingClip(clip);
      setExtendPrompt('');
    }}
  >
    <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
    Extend
  </Button>
)}
```

- [ ] **Step 4: Tambah modal extend sebelum closing tag `</div>` utama**

Tambah setelah `{clips.map(...)}`:

```tsx
{extendingClip && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div className="bg-background rounded-lg shadow-xl w-full max-w-lg space-y-4 p-6">
      <h3 className="font-semibold text-base">
        Extend Clip {(extendingClip.extended_from_index !== undefined ? extendingClip.index : extendingClip.index) + 1}
      </h3>
      <p className="text-sm text-muted-foreground">
        Deskripsikan apa yang terjadi selanjutnya setelah clip ini.
      </p>
      <Textarea
        value={extendPrompt}
        onChange={(e) => setExtendPrompt(e.target.value)}
        placeholder="Contoh: Camera slowly zooms out revealing the full product on a marble table..."
        className="min-h-[100px] text-sm"
      />
      <div className="flex gap-2 justify-between">
        <Button
          size="sm"
          variant="outline"
          disabled={suggestingPrompt}
          onClick={() => handleSuggestPrompt(extendingClip)}
        >
          {suggestingPrompt ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating...</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate Prompt</>
          )}
        </Button>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setExtendingClip(null); setExtendPrompt(''); }}
          >
            Batal
          </Button>
          <Button
            size="sm"
            disabled={!extendPrompt.trim() || submittingExtend}
            onClick={handleExtend}
          >
            {submittingExtend ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Extending...</>
            ) : (
              'Extend Video'
            )}
          </Button>
        </div>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Tambah `ArrowRight` ke import lucide-react**

Cari baris import lucide-react dan tambah `ArrowRight`:

```ts
import { Loader2, RefreshCw, Download, AlertCircle, ChevronDown, ChevronUp, Copy, Check, ArrowRight } from 'lucide-react';
```

- [ ] **Step 6: Verify TypeScript compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills && npx tsc --noEmit -p tsconfig.minimal.json 2>&1 | head -30
```

Expected: tidak ada error.

- [ ] **Step 7: Commit**

```bash
git add app/components/ClipResults.tsx
git commit -m "feat: tambah modal Extend ke ClipResults"
```

---

## Task 9: UI — Concatenate di `GenerationHistory.tsx`

**Files:**
- Modify: `app/components/GenerationHistory.tsx`

- [ ] **Step 1: Baca struktur GenerationHistory lengkap**

```bash
cat /Users/mac/Documents/Bharata-AI/ideamills/app/components/GenerationHistory.tsx
```

Pahami bagaimana generation detail dan clips ditampilkan. Cari bagian yang render clips dan lokasi yang tepat untuk menambah UI concatenate.

- [ ] **Step 2: Tambah state concatenate**

Di bagian state `GenerationHistory` component, tambah:

```ts
const [concatMode, setConcatMode] = useState<string | null>(null); // generationId yang sedang dalam mode seleksi
const [selectedForConcat, setSelectedForConcat] = useState<number[]>([]);
const [concatenating, setConcatenating] = useState(false);
```

- [ ] **Step 3: Tambah handler concatenate**

```ts
const toggleConcatSelect = (clipIndex: number) => {
  setSelectedForConcat((prev) =>
    prev.includes(clipIndex) ? prev.filter((i) => i !== clipIndex) : [...prev, clipIndex]
  );
};

const handleConcatenate = async (generationId: string) => {
  if (selectedForConcat.length < 2) return;
  setConcatenating(true);
  try {
    const res = await fetch('/api/studio/concatenate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId, clipIndices: selectedForConcat }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Gagal concatenate');
    }
    setConcatMode(null);
    setSelectedForConcat([]);
    fetchGenerations(true);
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Gagal menggabungkan video');
  } finally {
    setConcatenating(false);
  }
};
```

- [ ] **Step 4: Tambah tombol "Gabungkan Clips" dan mode seleksi**

Di bagian render setiap generation item, setelah `ClipResults` (atau di header generation card), tambah:

```tsx
{/* Tombol Gabungkan — muncul jika ada ≥2 clips done */}
{item.video_count >= 2 && concatMode !== item.id && (
  <Button
    size="sm"
    variant="outline"
    onClick={() => {
      setConcatMode(item.id);
      setSelectedForConcat([]);
    }}
  >
    Gabungkan Clips
  </Button>
)}

{/* Mode seleksi aktif */}
{concatMode === item.id && (
  <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 flex items-center justify-between z-40">
    <span className="text-sm font-medium">
      {selectedForConcat.length} clip dipilih
    </span>
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => { setConcatMode(null); setSelectedForConcat([]); }}
      >
        Batal
      </Button>
      <Button
        size="sm"
        disabled={selectedForConcat.length < 2 || concatenating}
        onClick={() => handleConcatenate(item.id)}
      >
        {concatenating ? (
          <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Menggabungkan...</>
        ) : (
          'Gabungkan'
        )}
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Pass `concatMode` dan `selectedForConcat` ke `ClipResults`**

Update `ClipResultsProps` di `ClipResults.tsx` untuk mendukung mode seleksi:

```ts
interface ClipResultsProps {
  generationId: string;
  clips: Clip[];
  productNotes?: string;
  styleNotes?: string;
  onClipUpdated?: () => void;
  concatMode?: boolean;           // apakah mode seleksi aktif
  selectedForConcat?: number[];   // clip indices yang dipilih
  onToggleConcatSelect?: (idx: number) => void;
}
```

Di dalam render clip card, saat `concatMode` aktif dan clip `video_status === 'done'`, tampilkan checkbox di pojok:

```tsx
{concatMode && clip.video_status === 'done' && (
  <input
    type="checkbox"
    className="w-4 h-4 absolute top-2 left-2"
    checked={selectedForConcat?.includes(clip.index) ?? false}
    onChange={() => onToggleConcatSelect?.(clip.index)}
  />
)}
```

- [ ] **Step 6: Tampilkan concatenated videos**

Di dalam render generation item, setelah clips, tambah section untuk `concatenated_videos`. Data ini perlu diambil dari API — update `GenerationItem` interface untuk include `concatenated_videos`:

```ts
interface GenerationItem {
  // ... existing fields ...
  concatenated_videos?: Array<{
    id: string;
    clip_indices: number[];
    status: 'generating' | 'done' | 'failed';
    local_path?: string | null;
    error?: string | null;
  }>;
}
```

Render concatenated videos:

```tsx
{item.concatenated_videos?.map((cv) => (
  <div key={cv.id} className="border rounded-lg p-3 space-y-2 bg-muted/30">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">
        Video Gabungan ({cv.clip_indices.length} clips)
      </span>
      <span className={`text-xs px-2 py-0.5 rounded-full ${
        cv.status === 'done' ? 'bg-green-500/10 text-green-700' :
        cv.status === 'failed' ? 'bg-destructive/10 text-destructive' :
        'bg-primary/10 text-primary'
      }`}>
        {cv.status === 'done' ? 'Selesai' : cv.status === 'failed' ? 'Gagal' : 'Processing'}
      </span>
    </div>
    {cv.status === 'done' && cv.local_path && (
      <div className="space-y-2">
        <video src={cv.local_path} controls className="w-full rounded bg-muted aspect-video" />
        <Button asChild size="sm" variant="outline">
          <a href={cv.local_path} download>
            <Download className="w-3.5 h-3.5 mr-1.5" /> Download
          </a>
        </Button>
      </div>
    )}
    {cv.status === 'failed' && cv.error && (
      <p className="text-xs text-destructive">{cv.error}</p>
    )}
  </div>
))}
```

- [ ] **Step 7: Update API `/api/generations` untuk include `concatenated_videos`**

Buka `app/api/generations/route.ts`. Cari bagian `projection` pada query generations. Pastikan `concatenated_videos` tidak di-exclude. Jika ada projection yang exclude field ini, tambahkan include-nya.

- [ ] **Step 8: Verify TypeScript compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills && npx tsc --noEmit -p tsconfig.minimal.json 2>&1 | head -30
```

Expected: tidak ada error.

- [ ] **Step 9: Commit**

```bash
git add app/components/GenerationHistory.tsx app/components/ClipResults.tsx app/api/generations/route.ts
git commit -m "feat: UI concatenate clips di History — mode seleksi + card hasil"
```

---

## Task 10: Run all tests & final compile check

- [ ] **Step 1: Run semua tests**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills && npx vitest run 2>&1 | tail -30
```

Expected: PASS semua test, termasuk `useapi-extend.test.ts`.

- [ ] **Step 2: Full TypeScript compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills && npx tsc --noEmit -p tsconfig.minimal.json 2>&1 | head -50
```

Expected: tidak ada error.

- [ ] **Step 3: Commit final jika ada perubahan kecil**

```bash
git add -A && git status
```

Jika ada file yang belum di-commit, commit sekarang.

---

## Catatan untuk Worker Polling

Worker yang ada sudah menangani polling `video_job_id` untuk clips dengan `video_status: 'queued'`. Extended clips menggunakan `video_job_id` yang sama dari `extendVideo()`. Pastikan setelah polling sukses, worker menyimpan `media_generation_id` dari response useapi ke field `clips.$.media_generation_id` — ini penting agar clip hasil extend bisa di-extend lagi.

Response dari `GET /google-flow/jobs/{jobId}` untuk extend job akan berisi `mediaGenerationId` di `response.media[0].mediaGenerationId`. Worker perlu menyimpan ini.
