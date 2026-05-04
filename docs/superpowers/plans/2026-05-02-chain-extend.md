# Chain Extend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clip 1 di-generate normal, clip 2+ di-extend secara berantai dari clip sebelumnya sehingga voice/tone konsisten di seluruh video.

**Architecture:** Worker mengganti `processWithConcurrency` dengan sequential chain: clip pertama generate normal (image → Veo generate), setiap clip berikutnya tunggu clip sebelumnya selesai lalu panggil `extendVideo(prevClip.media_generation_id, prompt)`. Regenerate single clip mengikuti logika yang sama — kalau bukan clip 0, extend dari clip sebelumnya.

**Tech Stack:** TypeScript, MongoDB (arrayFilters), useapi.net (extendVideo), existing `Clip` type dari `app/lib/types.ts`.

---

## File Structure

- Modify: `worker/runGeneration.ts` — ganti concurrency loop dengan sequential chain, tambah `extendClipAssets()`

Tidak ada file baru. Tidak ada perubahan UI. Tidak ada perubahan schema.

---

### Task 1: Ganti parallel processing dengan sequential chain di worker

**Files:**
- Modify: `worker/runGeneration.ts`

Saat ini `runV2StudioGeneration` memanggil `processWithConcurrency(clipsToProcess, 2, ...)`. Kita ganti dengan loop sequential yang:
- Clip index 0 (atau clip pertama di list) → `generateClipAssets()` seperti biasa
- Clip berikutnya → tunggu clip sebelumnya done → `extendClipAssets()`

Untuk regenerate single clip (`v2RegenerateClipIndex` di-set): kalau clip yang di-regenerate bukan index 0, fetch clip sebelumnya dari DB dan extend dari sana.

- [ ] **Step 1: Baca full `runV2StudioGeneration` dan `generateClipAssets` di `worker/runGeneration.ts`**

Pastikan paham field `media_generation_id` — setelah video selesai, field ini diupdate ke `videoMediaGenerationId` (media ID dari completed video job, bukan image). Ini yang dipakai sebagai input `extendVideo`.

- [ ] **Step 2: Tambah fungsi `extendClipAssets` di `worker/runGeneration.ts`**

Tambahkan setelah fungsi `generateClipAssets` (sebelum `processWithConcurrency`):

```typescript
async function extendClipAssets(
  generationId: string,
  clip: Clip,
  prevMediaGenerationId: string,
  styleNotes: string,
  veoModel: string,
) {
  const db = await getDb();
  const oid = new ObjectId(generationId);
  const arrayFilters = [{ 'c.index': clip.index }];

  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        'clips.$[c].is_extended': true,
        'clips.$[c].extended_from_index': clip.index - 1,
        'clips.$[c].image_status': 'done',
        'clips.$[c].video_status': 'queued',
        'clips.$[c].updated_at': new Date(),
        status: 'processing',
        updated_at: new Date(),
      },
    },
    { arrayFilters }
  );

  // Generate veo_prompt untuk extend (pakai cleanVeoPrompt jika belum ada)
  let veoPrompt = clip.veo_prompt ?? null;
  if (!veoPrompt) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        veoPrompt = await cleanVeoPrompt(clip.prompt, { generationId });
        await db.collection('Generations').updateOne(
          { _id: oid },
          { $set: { 'clips.$[c].veo_prompt': veoPrompt, 'clips.$[c].updated_at': new Date() } },
          { arrayFilters }
        );
        break;
      } catch (err) {
        console.warn(`[worker] cleanVeoPrompt attempt ${attempt} failed for clip ${clip.index}:`, err);
        if (attempt === 2) veoPrompt = clip.prompt;
      }
    }
  }

  const finalPrompt = [styleNotes, veoPrompt].filter(Boolean).join('\n\n');

  await db.collection('Generations').updateOne(
    { _id: oid },
    { $set: { 'clips.$[c].video_status': 'generating' } },
    { arrayFilters }
  );

  const jobId = await extendVideo({
    mediaGenerationId: prevMediaGenerationId,
    prompt: finalPrompt,
    model: veoModel,
  });

  await db.collection('Generations').updateOne(
    { _id: oid },
    { $set: { 'clips.$[c].video_job_id': jobId, 'clips.$[c].updated_at': new Date() } },
    { arrayFilters }
  );

  const videoUrl = await waitForVideo(jobId);
  const finalJob = await pollVideoJob(jobId);
  const videoMediaGenerationId = finalJob.mediaGenerationId ?? null;

  const creditCost = GOOGLE_FLOW_CREDIT_COSTS[veoModel] ?? GOOGLE_FLOW_CREDIT_COSTS['veo-3.1-fast'];
  await logAssetUsage({
    generationId,
    clipIndex: clip.index,
    service: 'veo',
    model: veoModel,
    creditCost,
    costUsd: creditCost * GOOGLE_FLOW_CREDIT_PRICE_USD,
    createdAt: new Date(),
  });

  const videoFilePath = await downloadAndSaveVideo(videoUrl, generationId, `clip-${clip.index}.mp4`);
  const videoPublicUrl = storagePathToUrl(videoFilePath);

  await db.collection('Generations').updateOne(
    { _id: oid },
    {
      $set: {
        'clips.$[c].video_status': 'done',
        'clips.$[c].generated_video_path': videoPublicUrl,
        ...(videoMediaGenerationId ? { 'clips.$[c].media_generation_id': videoMediaGenerationId } : {}),
        'clips.$[c].updated_at': new Date(),
      },
    },
    { arrayFilters }
  );
}
```

- [ ] **Step 3: Ganti loop di `runV2StudioGeneration` dengan sequential chain**

Ganti blok ini:
```typescript
await processWithConcurrency(clipsToProcess, CLIP_CONCURRENCY, async (clip) => {
  try {
    await generateClipAssets(generationId, clip, productImageUrl, styleNotes, veoModel, aspectRatio);
  } catch (err) {
    ...
  }
});
```

Dengan:
```typescript
// Helper: ambil media_generation_id clip yang sudah done dari DB
async function getCompletedMediaId(generationId: string, clipIndex: number): Promise<string | null> {
  const db = await getDb();
  const oid = new ObjectId(generationId);
  const gen = await db.collection('Generations').findOne({ _id: oid });
  const clips = (gen?.clips ?? []) as Clip[];
  const clip = clips.find((c) => c.index === clipIndex);
  return clip?.media_generation_id ?? null;
}

// Sequential chain: clip 0 generate, clip 1+ extend dari sebelumnya
// Untuk regenerate single clip: kalau bukan index 0, extend dari clip sebelumnya
const isSingleRegenerate = typeof payload.v2RegenerateClipIndex === 'number';

if (isSingleRegenerate) {
  const clip = clipsToProcess[0];
  if (clip.index === 0) {
    // Clip 0 selalu generate normal
    try {
      await generateClipAssets(generationId, clip, productImageUrl, styleNotes, veoModel, aspectRatio);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await db.collection('Generations').updateOne(
        { _id: oid },
        { $set: { 'clips.$[c].video_status': 'failed', 'clips.$[c].video_error': errMsg, 'clips.$[c].updated_at': new Date() } },
        { arrayFilters: [{ 'c.index': clip.index }] }
      );
    }
  } else {
    // Extend dari clip sebelumnya
    const prevMediaId = await getCompletedMediaId(generationId, clip.index - 1);
    if (!prevMediaId) {
      await db.collection('Generations').updateOne(
        { _id: oid },
        { $set: { 'clips.$[c].video_status': 'failed', 'clips.$[c].video_error': `Clip ${clip.index - 1} belum selesai atau tidak punya media_generation_id`, 'clips.$[c].updated_at': new Date() } },
        { arrayFilters: [{ 'c.index': clip.index }] }
      );
    } else {
      try {
        await extendClipAssets(generationId, clip, prevMediaId, styleNotes, veoModel);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await db.collection('Generations').updateOne(
          { _id: oid },
          { $set: { 'clips.$[c].video_status': 'failed', 'clips.$[c].video_error': errMsg, 'clips.$[c].updated_at': new Date() } },
          { arrayFilters: [{ 'c.index': clip.index }] }
        );
      }
    }
  }
} else {
  // Full generation: sequential chain
  // Sort clips by index untuk pastikan urutan benar
  const sorted = [...clipsToProcess].sort((a, b) => a.index - b.index);
  let prevMediaId: string | null = null;

  for (const clip of sorted) {
    if (clip.index === 0 || prevMediaId === null) {
      // Generate normal
      try {
        await generateClipAssets(generationId, clip, productImageUrl, styleNotes, veoModel, aspectRatio);
        // Ambil media_generation_id dari DB setelah selesai (diupdate oleh generateClipAssets)
        prevMediaId = await getCompletedMediaId(generationId, clip.index);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await db.collection('Generations').updateOne(
          { _id: oid },
          { $set: { 'clips.$[c].video_status': 'failed', 'clips.$[c].video_error': errMsg, 'clips.$[c].updated_at': new Date() } },
          { arrayFilters: [{ 'c.index': clip.index }] }
        );
        prevMediaId = null; // chain putus — clip berikutnya tidak bisa extend
      }
    } else {
      // Extend dari clip sebelumnya
      try {
        await extendClipAssets(generationId, clip, prevMediaId, styleNotes, veoModel);
        prevMediaId = await getCompletedMediaId(generationId, clip.index);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await db.collection('Generations').updateOne(
          { _id: oid },
          { $set: { 'clips.$[c].video_status': 'failed', 'clips.$[c].video_error': errMsg, 'clips.$[c].updated_at': new Date() } },
          { arrayFilters: [{ 'c.index': clip.index }] }
        );
        prevMediaId = null;
      }
    }
  }
}
```

- [ ] **Step 4: Pindahkan `getCompletedMediaId` ke luar `runV2StudioGeneration` (jadi top-level function)**

Helper ini perlu akses DB, jadi harus jadi function biasa di level module, bukan nested. Pindahkan ke section setelah imports, sebelum `runGeneration`.

```typescript
async function getCompletedMediaId(generationId: string, clipIndex: number): Promise<string | null> {
  const db = await getDb();
  const oid = new ObjectId(generationId);
  const gen = await db.collection('Generations').findOne({ _id: oid });
  const clips = (gen?.clips ?? []) as Clip[];
  const clip = clips.find((c) => c.index === clipIndex);
  return clip?.media_generation_id ?? null;
}
```

- [ ] **Step 5: Hapus `processWithConcurrency` dan konstanta `CLIP_CONCURRENCY` yang sudah tidak dipakai**

Hapus:
```typescript
const CLIP_CONCURRENCY = 2;
```

Dan hapus seluruh fungsi:
```typescript
async function processWithConcurrency<T>(...) { ... }
```

- [ ] **Step 6: Pastikan import `extendVideo` sudah ada di top of file**

Cek baris import:
```typescript
import { uploadImageAsset, createVideoJob, waitForVideo, pollVideoJob } from '../app/lib/useapi';
```

Tambah `extendVideo` jika belum ada:
```typescript
import { uploadImageAsset, createVideoJob, waitForVideo, pollVideoJob, extendVideo } from '../app/lib/useapi';
```

- [ ] **Step 7: Build TypeScript untuk pastikan tidak ada error**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills
npx tsc --noEmit
```

Expected: tidak ada error. Kalau ada error TypeScript, fix sebelum lanjut.

- [ ] **Step 8: Commit**

```bash
git add worker/runGeneration.ts
git commit -m "feat: chain extend — clip 2+ extend dari clip sebelumnya untuk konsistensi voice"
```

---

### Task 2: Handle edge case — chain putus karena clip sebelumnya gagal

**Files:**
- Modify: `worker/runGeneration.ts`

Kalau clip N gagal, `prevMediaId` jadi `null` dan clip N+1 tidak bisa extend. Saat ini clip N+1 akan `generateClipAssets` (fallback ke generate normal karena `prevMediaId === null`). Ini behavior yang acceptable — chain putus tapi generation tetap jalan.

Tapi perlu ditambahkan log yang jelas agar mudah debug.

- [ ] **Step 1: Tambah warning log saat chain putus**

Di bagian `catch` setelah `generateClipAssets` dan `extendClipAssets` di full generation loop, tambahkan:

```typescript
console.warn(`[worker] Clip ${clip.index} failed, chain broken. Next clip will attempt generate independently.`);
```

- [ ] **Step 2: Commit**

```bash
git add worker/runGeneration.ts
git commit -m "fix: log warning saat chain extend putus karena clip gagal"
```
