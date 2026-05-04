# Veo Prompt Cleaner Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan `cleanVeoPrompt()` layer yang mengubah `clip.prompt` (Indonesia naratif) menjadi `clip.veo_prompt` (Veo-ready: English technical + dialog Indonesia) sebelum dikirim ke Veo.

**Architecture:** Satu LLM call tambahan (`google/gemini-2.5-flash`) dipanggil di worker setelah image upload, sebelum `createVideoJob`. Hasil disimpan di field baru `clip.veo_prompt` di DB. `clip.prompt` original tetap disimpan dan ditampilkan di UI. Fallback ke `clip.prompt` jika cleaning gagal.

**Tech Stack:** TypeScript, Next.js, MongoDB, OpenRouter (`google/gemini-2.5-flash`), Vitest

---

## File Structure

| File | Perubahan |
|------|-----------|
| `app/lib/types.ts` | Tambah `veo_prompt?: string \| null` di `Clip` interface |
| `app/lib/llm/prompts.ts` | Tambah `CLEAN_VEO_SYSTEM` + `CLEAN_VEO_USER` |
| `app/lib/llm/index.ts` | Tambah `cleanVeoPrompt(rawPrompt, ctx?)` |
| `app/lib/__tests__/clean-veo-prompt.test.ts` | Test baru untuk `cleanVeoPrompt` |
| `worker/runGeneration.ts` | Panggil `cleanVeoPrompt` sebelum `createVideoJob`, simpan `veo_prompt` ke DB |
| `app/components/ClipResults.tsx` | Tampilkan `veo_prompt` di "Lihat prompt lengkap" section |

---

## Task 1: Tambah `veo_prompt` ke Clip type

**Files:**
- Modify: `app/lib/types.ts:112-129`

- [ ] **Step 1: Edit `Clip` interface**

Di `app/lib/types.ts`, tambah field `veo_prompt` setelah `video_job_id`:

```typescript
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
  veo_prompt?: string | null;          // cleaned Veo-ready prompt, null = not yet cleaned
  is_extended?: boolean;
  extended_from_index?: number | null;
  created_at: Date;
  updated_at?: Date;
}
```

- [ ] **Step 2: Verify TypeScript compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (atau error yang sudah ada sebelumnya, bukan error baru).

- [ ] **Step 3: Commit**

```bash
git add app/lib/types.ts
git commit -m "feat: add veo_prompt field to Clip type"
```

---

## Task 2: Tulis prompt constants untuk cleanVeoPrompt

**Files:**
- Modify: `app/lib/llm/prompts.ts` (append di akhir file)

- [ ] **Step 1: Append dua export constants di akhir `prompts.ts`**

```typescript
export const CLEAN_VEO_SYSTEM = `Kamu adalah Veo prompt formatter untuk iklan video Indonesia. Tugasmu SANGAT TERBATAS:

INPUT: satu clip prompt dalam Bahasa Indonesia naratif, berisi aksi model, dialog, dan deskripsi visual.
OUTPUT: prompt yang sama dalam format Veo-ready — satu paragraf padat, max 80 kata.

ATURAN WAJIB:
1. PERTAHANKAN dialog model PERSIS kata per kata — jangan translate, jangan paraphrase, jangan persingkat. Dialog biasanya ditulis setelah "model berbicara:" atau dalam tanda kutip.
2. CONVERT deskripsi visual/technical ke Bahasa Inggris: lighting, camera direction, motion, setting, material, action verbs.
3. PERTAHANKAN max 2 major actions — jangan tambah aksi baru.
4. FORMAT: [aksi visual dalam Inggris] → [dialog Indonesia persis] → [camera direction Inggris].
5. HAPUS prose naratif berlebih, pengulangan, dan negation phrases di deskripsi visual (flip ke positive).
6. JANGAN tambah konten baru yang tidak ada di source prompt.
7. Output HANYA prompt-nya. Tanpa preamble. Tanpa penjelasan. Tanpa markdown.

CONTOH:
INPUT: "Model wanita duduk santai di sofa krem, mengambil botol GlowBooster dari meja, tersenyum ke kamera dan berkata: 'Kulitku kusam? Oh sekarang sudah bye-bye! Pake tiap pagi, hasilnya langsung keliatan.' Ekspresi antusias dan natural. Kamera statis."
OUTPUT: "Indonesian woman sits on cream sofa, picks up GlowBooster bottle from table, smiles warmly at camera. Speaks directly to camera, lips sync: 'Kulitku kusam? Oh sekarang sudah bye-bye! Pake tiap pagi, hasilnya langsung keliatan.' Static camera, single take, clean frame."`;

export const CLEAN_VEO_USER = (rawPrompt: string) =>
  `Format prompt berikut ke Veo-ready (max 80 kata). Pertahankan dialog Indonesia persis. Convert visual/technical terms ke Inggris:\n\n${rawPrompt}`;
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/llm/prompts.ts
git commit -m "feat: add CLEAN_VEO_SYSTEM and CLEAN_VEO_USER prompt constants"
```

---

## Task 3: Implementasi `cleanVeoPrompt` di llm/index.ts

**Files:**
- Modify: `app/lib/llm/index.ts`

- [ ] **Step 1: Tambah import `CLEAN_VEO_SYSTEM` dan `CLEAN_VEO_USER`**

Di `app/lib/llm/index.ts`, update import dari `./prompts` (saat ini ada di baris 8-14):

```typescript
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
  CLEAN_VEO_SYSTEM,
  CLEAN_VEO_USER,
} from './prompts';
```

- [ ] **Step 2: Append fungsi `cleanVeoPrompt` di akhir file (setelah `suggestExtendPrompt`)**

```typescript
export async function cleanVeoPrompt(
  rawPrompt: string,
  ctx?: { jobId?: string; generationId?: string }
): Promise<string> {
  const result = await chat<string>(
    ctx,
    'expand',
    'google/gemini-2.5-flash',
    [
      { role: 'system', content: CLEAN_VEO_SYSTEM },
      { role: 'user', content: CLEAN_VEO_USER(rawPrompt) },
    ],
    { maxTokens: 1500, timeoutMs: 30_000 }
  );
  const cleaned = (result as string).trim();
  if (!cleaned) {
    throw new LLMError('Empty cleaned prompt', 'INVALID_RESPONSE', 'openrouter', 'google/gemini-2.5-flash');
  }
  return cleaned;
}
```

- [ ] **Step 3: Verify compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/llm/index.ts
git commit -m "feat: add cleanVeoPrompt LLM function"
```

---

## Task 4: Tulis unit test untuk cleanVeoPrompt

**Files:**
- Create: `app/lib/__tests__/clean-veo-prompt.test.ts`

- [ ] **Step 1: Buat file test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chatCompletion so no real API calls are made
vi.mock('../llm/client', () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from '../llm/client';
const mockChat = vi.mocked(chatCompletion);

describe('cleanVeoPrompt', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns cleaned prompt dari LLM response', async () => {
    mockChat.mockResolvedValueOnce({
      choices: [{ message: { content: 'Indonesian woman sits on sofa, speaks: "Kulitku kusam? Sekarang bye-bye!" Static camera.' }, finish_reason: 'stop' }],
      model: 'google/gemini-2.5-flash',
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    } as any);

    const { cleanVeoPrompt } = await import('../llm/index');
    const result = await cleanVeoPrompt(
      'Model wanita duduk santai di sofa, berkata: "Kulitku kusam? Sekarang bye-bye!" Kamera statis.'
    );

    expect(result).toBe('Indonesian woman sits on sofa, speaks: "Kulitku kusam? Sekarang bye-bye!" Static camera.');
    expect(mockChat).toHaveBeenCalledOnce();
  });

  it('throw LLMError jika response kosong', async () => {
    mockChat.mockResolvedValueOnce({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }],
      model: 'google/gemini-2.5-flash',
      usage: { prompt_tokens: 100, completion_tokens: 0 },
    } as any);

    const { cleanVeoPrompt } = await import('../llm/index');
    await expect(cleanVeoPrompt('some prompt')).rejects.toThrow('Empty cleaned prompt');
  });

  it('menggunakan model google/gemini-2.5-flash', async () => {
    mockChat.mockResolvedValueOnce({
      choices: [{ message: { content: 'Clean prompt result.' }, finish_reason: 'stop' }],
      model: 'google/gemini-2.5-flash',
      usage: { prompt_tokens: 80, completion_tokens: 30 },
    } as any);

    const { cleanVeoPrompt } = await import('../llm/index');
    await cleanVeoPrompt('raw prompt');

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'google/gemini-2.5-flash' }),
      30_000
    );
  });
});
```

- [ ] **Step 2: Jalankan test — pastikan PASS**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills
npx vitest run app/lib/__tests__/clean-veo-prompt.test.ts 2>&1
```

Expected: 3 tests pass.

- [ ] **Step 3: Jalankan semua test — pastikan tidak ada regresi**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: semua test pass (jumlah sama atau lebih dari sebelumnya).

- [ ] **Step 4: Commit**

```bash
git add app/lib/__tests__/clean-veo-prompt.test.ts
git commit -m "test: add cleanVeoPrompt unit tests"
```

---

## Task 5: Integrasikan cleanVeoPrompt di worker

**Files:**
- Modify: `worker/runGeneration.ts`

- [ ] **Step 1: Tambah import `cleanVeoPrompt`**

Di `worker/runGeneration.ts` baris 1-7, tambah `cleanVeoPrompt` ke import dari llm:

```typescript
import { ObjectId } from 'mongodb';
import { getDb } from '../app/lib/mongoClient';
import { uploadImageAsset, createVideoJob, waitForVideo, pollVideoJob } from '../app/lib/useapi';
import { saveImage, downloadAndSaveVideo, storagePathToUrl } from '../app/lib/storage';
import { logAssetUsage } from '../app/lib/monitoring/assetUsage';
import { GOOGLE_FLOW_CREDIT_COSTS, GOOGLE_FLOW_CREDIT_PRICE_USD } from '../app/lib/monitoring/creditCosts';
import { cleanVeoPrompt } from '../app/lib/llm';
import type { Clip, ClipImageMode } from '../app/lib/types';
```

- [ ] **Step 2: Ganti `const finalPrompt = clip.prompt` dengan cleanVeoPrompt call**

Di `worker/runGeneration.ts` sekitar baris 261-269, ganti blok ini:

```typescript
  // Veo prompt = clip.prompt saja. productNotes + styleNotes sudah ter-encode di image (yang
  // jadi startImage), kirim ulang ke Veo bikin prompt terlalu panjang dan sering fail.
  const finalPrompt = clip.prompt;
  const veoJobId = await createVideoJob({
    imageUrl: mediaGenerationId,
    prompt: finalPrompt,
    model: veoModel,
    aspectRatio,
  });
```

Dengan:

```typescript
  // Clean prompt: convert Indonesia naratif → Veo-ready English + dialog Indo intact.
  // Fallback ke clip.prompt jika cleaning gagal agar generation tidak terhenti.
  let veoPrompt = clip.prompt;
  try {
    veoPrompt = await cleanVeoPrompt(clip.prompt, { generationId });
    await db.collection('Generations').updateOne(
      { _id: oid },
      { $set: { 'clips.$[c].veo_prompt': veoPrompt, 'clips.$[c].updated_at': new Date() } },
      { arrayFilters }
    );
  } catch (err) {
    console.warn(`[worker] cleanVeoPrompt failed for clip ${clip.index}, using raw prompt:`, err);
  }
  const veoJobId = await createVideoJob({
    imageUrl: mediaGenerationId,
    prompt: veoPrompt,
    model: veoModel,
    aspectRatio,
  });
```

- [ ] **Step 3: Verify TypeScript compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Jalankan semua test**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: semua test pass.

- [ ] **Step 5: Commit**

```bash
git add worker/runGeneration.ts
git commit -m "feat: integrate cleanVeoPrompt in worker before createVideoJob"
```

---

## Task 6: Tampilkan `veo_prompt` di ClipResults UI

**Files:**
- Modify: `app/components/ClipResults.tsx:157-194`

- [ ] **Step 1: Tambah `veo_prompt` ke expanded section**

Di `app/components/ClipResults.tsx`, cari blok `{expandedClip === clip.index && (` (sekitar baris 157). Tambah block `veo_prompt` setelah `Clip Prompt` block dan sebelum `Full Prompt` block:

```tsx
{expandedClip === clip.index && (
  <div className="space-y-3 border-t pt-3 text-xs">
    {productNotes && (
      <PromptBlock
        label="Product Detail"
        value={productNotes}
        fieldId={`product-${clip.index}`}
        copiedField={copiedField}
        onCopy={copyToClipboard}
      />
    )}
    {styleNotes && (
      <PromptBlock
        label="Style Notes"
        value={styleNotes}
        fieldId={`style-${clip.index}`}
        copiedField={copiedField}
        onCopy={copyToClipboard}
      />
    )}
    <PromptBlock
      label="Clip Prompt (original)"
      value={clip.prompt}
      fieldId={`prompt-${clip.index}`}
      copiedField={copiedField}
      onCopy={copyToClipboard}
    />
    {clip.veo_prompt && (
      <PromptBlock
        label="Veo Prompt (dikirim ke Veo)"
        value={clip.veo_prompt}
        fieldId={`veo-${clip.index}`}
        copiedField={copiedField}
        onCopy={copyToClipboard}
      />
    )}
    {(productNotes || styleNotes) && (
      <PromptBlock
        label="Full Prompt (preview gabungan — hanya Clip Prompt yang dikirim ke Veo)"
        value={[productNotes, styleNotes, clip.veo_prompt ?? clip.prompt].filter(Boolean).join('\n\n')}
        fieldId={`full-${clip.index}`}
        copiedField={copiedField}
        onCopy={copyToClipboard}
      />
    )}
  </div>
)}
```

Perhatikan dua perubahan vs kode lama:
1. Label `"Clip Prompt"` → `"Clip Prompt (original)"`
2. Full Prompt menggunakan `clip.veo_prompt ?? clip.prompt` (bukan `clip.prompt`)
3. Tambah block baru `Veo Prompt (dikirim ke Veo)` jika `clip.veo_prompt` ada

- [ ] **Step 2: Verify TypeScript compile**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/ClipResults.tsx
git commit -m "feat: show veo_prompt in ClipResults expanded section"
```

---

## Task 7: Verifikasi end-to-end

- [ ] **Step 1: Jalankan semua test sekali lagi**

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills
npx vitest run 2>&1 | tail -15
```

Expected: semua pass, tidak ada regresi.

- [ ] **Step 2: Build check**

```bash
npx next build 2>&1 | tail -20
```

Expected: build sukses tanpa error.

- [ ] **Step 3: Final commit jika ada perubahan unstaged**

```bash
git status
```

Jika ada file yang belum di-commit, commit sekarang.
