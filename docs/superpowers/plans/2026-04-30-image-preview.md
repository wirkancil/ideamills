# AI Image Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tombol "AI" di ImageSlot langsung trigger image generation via useapi (Imagen-4) dengan preview real-time, sehingga user bisa lihat dan regenerate sebelum klik "Buat Video".

**Architecture:** Endpoint baru `/api/studio/generate-image` panggil useapi `generateImage` dan return base64 data URL. ImageSlot diubah jadi async — klik AI = fetch endpoint, simpan hasil ke `clip.imageDataUrl`. Worker disederhanakan: `imageDataUrl` selalu dipakai langsung untuk mode `ai-generate` (skip useapi call).

**Tech Stack:** TypeScript, Next.js App Router, useapi.net Google Flow, React state

---

## File Map

| File | Aksi | Tanggung jawab |
|------|------|----------------|
| `app/api/studio/generate-image/route.ts` | Create | Endpoint sync image generation, panggil useapi, return base64 |
| `app/studio/components/ImageSlot.tsx` | Modify | Async tombol AI, loading state, terima props baru |
| `app/studio/components/ClipEditor.tsx` | Modify | Pass `aspectRatio` ke ImageSlot, update canSubmit, helper text |
| `app/studio/page.tsx` | Modify | Pass `aspectRatio` ke ClipEditor, kirim imageDataUrl untuk ai-generate |
| `app/api/studio/generate/route.ts` | Modify | Update zod refine — ai-generate juga butuh imageDataUrl |
| `worker/runGeneration.ts` | Modify | Sederhanakan blok ai-generate — pakai imageDataUrl langsung |

---

## Task 1: Buat endpoint /api/studio/generate-image

**Files:**
- Create: `app/api/studio/generate-image/route.ts`

- [ ] **Step 1: Buat file route**

Buat file `app/api/studio/generate-image/route.ts` dengan isi:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateImage } from '@/app/lib/useapi';

const RequestSchema = z.object({
  prompt: z.string().min(10).max(5000),
  styleNotes: z.string().max(2000).optional().default(''),
  aspectRatio: z.enum(['portrait', 'landscape']).optional().default('portrait'),
  model: z.enum(['imagen-4', 'nano-banana-2', 'nano-banana-pro']).optional().default('imagen-4'),
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

    const { prompt, styleNotes, aspectRatio, model } = parsed.data;
    const fullPrompt = styleNotes ? `${styleNotes}\n\n${prompt}` : prompt;
    const imgAspect = aspectRatio === 'portrait' ? '9:16' : '16:9';

    const imgRes = await generateImage({
      prompt: fullPrompt,
      aspectRatio: imgAspect,
      model,
    });

    // Download fifeUrl, convert ke base64 data URL
    const fetched = await fetch(imgRes.imageUrl);
    if (!fetched.ok) {
      return NextResponse.json(
        { error: `Failed to download image from useapi (${fetched.status})` },
        { status: 500 }
      );
    }
    const buffer = Buffer.from(await fetched.arrayBuffer());
    const base64 = buffer.toString('base64');
    const imageDataUrl = `data:image/jpeg;base64,${base64}`;

    return NextResponse.json({
      imageDataUrl,
      mediaGenerationId: imgRes.mediaGenerationId,
    });
  } catch (error) {
    console.error('/api/studio/generate-image error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "generate-image"
```
Expected: tidak ada error.

---

## Task 2: Update ImageSlot — async AI button + loading state

**Files:**
- Modify: `app/studio/components/ImageSlot.tsx`

- [ ] **Step 1: Update interface dan import**

Di `app/studio/components/ImageSlot.tsx`, ganti baris 1–22 dengan:

```tsx
'use client';

import { useRef, useState } from 'react';
import { Upload, Sparkles, Image as ImageIcon, FolderOpen, Loader2 } from 'lucide-react';
import type { ClipImageMode } from '@/app/lib/types';
import { AssetPicker } from '@/app/components/AssetPicker';

interface ImageSlotProps {
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;
  productPreview: string | null;
  clipPrompt: string;
  styleNotes: string;
  aspectRatio: 'portrait' | 'landscape';
  onChange: (mode: ClipImageMode, imageDataUrl?: string | null) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 2: Update component signature dan tambah state generating + error**

Ganti baris 24–26:
```tsx
export function ImageSlot({ imageMode, imageDataUrl, productPreview, onChange }: ImageSlotProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
```

Dengan:
```tsx
export function ImageSlot({
  imageMode,
  imageDataUrl,
  productPreview,
  clipPrompt,
  styleNotes,
  aspectRatio,
  onChange,
}: ImageSlotProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAiGenerate = async () => {
    if (clipPrompt.trim().length < 10) {
      setError('Prompt minimal 10 karakter sebelum generate AI image.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: clipPrompt, styleNotes, aspectRatio }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.imageDataUrl) throw new Error('No imageDataUrl in response');
      onChange('ai-generate', data.imageDataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal generate image');
    } finally {
      setGenerating(false);
    }
  };
```

- [ ] **Step 3: Update tombol AI dan tambah preview/error display**

Ganti tombol AI (sekitar baris 78–86) dari:
```tsx
        <button
          type="button"
          onClick={() => onChange('ai-generate', null)}
          className={`px-2 py-1 rounded-md border flex items-center gap-1 ${
            imageMode === 'ai-generate' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
        >
          <Sparkles className="w-3 h-3" /> AI
        </button>
```

Dengan:
```tsx
        <button
          type="button"
          onClick={handleAiGenerate}
          disabled={generating}
          className={`px-2 py-1 rounded-md border flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
            imageMode === 'ai-generate' && imageDataUrl ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
          title={imageMode === 'ai-generate' && imageDataUrl ? 'Klik untuk regenerate' : 'Generate AI image'}
        >
          {generating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          {imageMode === 'ai-generate' && imageDataUrl ? 'Regenerate' : 'AI'}
        </button>
```

- [ ] **Step 4: Tambah error message + loading overlay di preview slot**

Cari blok preview slot (baris 45–53):
```tsx
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="clip image" className="w-12 h-8 object-cover rounded-md border" />
        ) : (
          <div className="w-12 h-8 rounded-md border bg-muted flex items-center justify-center">
            <ImageIcon className="w-3 h-3 text-muted-foreground" />
          </div>
        )}
```

Ganti dengan:
```tsx
        {generating ? (
          <div className="w-12 h-8 rounded-md border bg-muted flex items-center justify-center">
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          </div>
        ) : previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="clip image" className="w-12 h-8 object-cover rounded-md border" />
        ) : (
          <div className="w-12 h-8 rounded-md border bg-muted flex items-center justify-center">
            <ImageIcon className="w-3 h-3 text-muted-foreground" />
          </div>
        )}
```

Lalu setelah closing `</div>` row tombol (sebelum `<input ref={fileRef} ...>`), tambahkan:
```tsx
      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}
```

- [ ] **Step 5: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "ImageSlot"
```
Expected: tidak ada error.

---

## Task 3: Update ClipEditor — pass aspectRatio + canSubmit + helper text

**Files:**
- Modify: `app/studio/components/ClipEditor.tsx`

- [ ] **Step 1: Tambah aspectRatio di ClipEditorProps**

Cari interface `ClipEditorProps` (sekitar baris 20–29) dan ganti:
```ts
interface ClipEditorProps {
  styleNotes: string;
  onStyleNotesChange: (v: string) => void;
  clips: ClipDraft[];
  onClipsChange: (clips: ClipDraft[]) => void;
  productPreview: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}
```

Dengan:
```ts
interface ClipEditorProps {
  styleNotes: string;
  onStyleNotesChange: (v: string) => void;
  clips: ClipDraft[];
  onClipsChange: (clips: ClipDraft[]) => void;
  productPreview: string | null;
  aspectRatio: 'portrait' | 'landscape';
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}
```

- [ ] **Step 2: Tambah aspectRatio di destructure props**

Cari signature function `ClipEditor` (sekitar baris 34–43) dan tambahkan `aspectRatio` setelah `productPreview`:

```tsx
export function ClipEditor({
  styleNotes,
  onStyleNotesChange,
  clips,
  onClipsChange,
  productPreview,
  aspectRatio,
  submitting,
  onSubmit,
  onBack,
}: ClipEditorProps) {
```

- [ ] **Step 3: Update canSubmit untuk include ai-generate check**

Cari `canSubmit` (sekitar baris 99–100) dan ganti:
```ts
  const canSubmit =
    !submitting && clips.length >= MIN_CLIPS && clips.every((c) => c.prompt.trim().length >= 10);
```

Dengan:
```ts
  const canSubmit =
    !submitting &&
    clips.length >= MIN_CLIPS &&
    clips.every((c) => {
      if (c.prompt.trim().length < 10) return false;
      if (c.imageMode === 'override' && !c.imageDataUrl) return false;
      if (c.imageMode === 'ai-generate' && !c.imageDataUrl) return false;
      return true;
    });

  const needsAiImage = clips.some((c) => c.imageMode === 'ai-generate' && !c.imageDataUrl);
```

- [ ] **Step 4: Pass props baru ke ImageSlot**

Cari `<ImageSlot ... />` (sekitar baris 170–177) dan ganti:
```tsx
            <ImageSlot
              imageMode={clip.imageMode}
              imageDataUrl={clip.imageDataUrl}
              productPreview={productPreview}
              onChange={(mode, dataUrl) =>
                updateClip(clip.index, { imageMode: mode, imageDataUrl: dataUrl ?? null })
              }
            />
```

Dengan:
```tsx
            <ImageSlot
              imageMode={clip.imageMode}
              imageDataUrl={clip.imageDataUrl}
              productPreview={productPreview}
              clipPrompt={clip.prompt}
              styleNotes={styleNotes}
              aspectRatio={aspectRatio}
              onChange={(mode, dataUrl) =>
                updateClip(clip.index, { imageMode: mode, imageDataUrl: dataUrl ?? null })
              }
            />
```

- [ ] **Step 5: Tambah helper text di atas tombol Buat Video**

Cari tombol "Buat Video" (sekitar baris 192–204) yang dimulai dengan `<Button size="lg" className="w-full" disabled={!canSubmit} onClick={onSubmit}>`. Tambahkan helper text **sebelum** Button itu:

```tsx
      {needsAiImage && (
        <p className="text-xs text-amber-600 text-center">
          ⚠️ Generate AI image dulu untuk clip yang dipilih AI mode sebelum Buat Video.
        </p>
      )}

      <Button size="lg" className="w-full" disabled={!canSubmit} onClick={onSubmit}>
```

- [ ] **Step 6: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "ClipEditor"
```
Expected: tidak ada error.

---

## Task 4: Update studio/page.tsx — pass aspectRatio + send imageDataUrl untuk ai-generate

**Files:**
- Modify: `app/studio/page.tsx`

- [ ] **Step 1: Update mapping clips di handleSubmitVideo**

Cari fungsi `handleSubmitVideo` (sekitar baris 152–180), pada bagian `clips: clips.map(...)`, ganti:

```ts
          clips: clips.map((c) => ({
            index: c.index,
            prompt: c.prompt,
            imageMode: c.imageMode,
            imageDataUrl: c.imageMode === 'override' ? c.imageDataUrl : null,
          })),
```

Dengan:
```ts
          clips: clips.map((c) => ({
            index: c.index,
            prompt: c.prompt,
            imageMode: c.imageMode,
            imageDataUrl:
              c.imageMode === 'override' || c.imageMode === 'ai-generate'
                ? c.imageDataUrl
                : null,
          })),
```

- [ ] **Step 2: Pass aspectRatio ke ClipEditor**

Cari render `<ClipEditor ... />` di akhir render (sekitar baris 434–444):
```tsx
        {step === 'edit-clips' && (
          <ClipEditor
            styleNotes={styleNotes}
            onStyleNotesChange={setStyleNotes}
            clips={clips}
            onClipsChange={setClips}
            productPreview={productImage}
            submitting={submittingVideo}
            onSubmit={handleSubmitVideo}
            onBack={() => setStep('pick-idea')}
          />
        )}
```

Tambahkan `aspectRatio={aspectRatio}` setelah `productPreview`:
```tsx
        {step === 'edit-clips' && (
          <ClipEditor
            styleNotes={styleNotes}
            onStyleNotesChange={setStyleNotes}
            clips={clips}
            onClipsChange={setClips}
            productPreview={productImage}
            aspectRatio={aspectRatio}
            submitting={submittingVideo}
            onSubmit={handleSubmitVideo}
            onBack={() => setStep('pick-idea')}
          />
        )}
```

- [ ] **Step 3: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "studio/page"
```
Expected: tidak ada error.

---

## Task 5: Update zod refine di /api/studio/generate

**Files:**
- Modify: `app/api/studio/generate/route.ts`

- [ ] **Step 1: Update refine — ai-generate juga butuh imageDataUrl**

Cari `ClipDraftSchema` (sekitar baris 9–17) dan ganti:
```ts
const ClipDraftSchema = z.object({
  index: z.number().int().min(0).max(5),
  prompt: z.string().min(10).max(5000),
  imageMode: z.enum(['inherit', 'override', 'ai-generate']),
  imageDataUrl: z.string().nullable().optional(),
}).refine(
  (clip) => clip.imageMode !== 'override' || (typeof clip.imageDataUrl === 'string' && clip.imageDataUrl.length > 0),
  { message: 'Foto wajib di-upload untuk imageMode override' }
);
```

Dengan:
```ts
const ClipDraftSchema = z.object({
  index: z.number().int().min(0).max(5),
  prompt: z.string().min(10).max(5000),
  imageMode: z.enum(['inherit', 'override', 'ai-generate']),
  imageDataUrl: z.string().nullable().optional(),
}).refine(
  (clip) => {
    if (clip.imageMode === 'inherit') return true;
    return typeof clip.imageDataUrl === 'string' && clip.imageDataUrl.length > 0;
  },
  { message: 'Foto wajib ada (upload manual atau generate AI dulu) sebelum Buat Video' }
);
```

- [ ] **Step 2: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "generate/route"
```
Expected: tidak ada error.

---

## Task 6: Sederhanakan worker — pakai imageDataUrl untuk ai-generate

**Files:**
- Modify: `worker/runGeneration.ts`

- [ ] **Step 1: Hapus blok ai-generate yang call useapi**

Di `worker/runGeneration.ts`, cari blok `} else {` di dalam `generateClipAssets` (sekitar baris 178–202) yang mulai dengan komentar `// ai-generate: build image prompt with style notes + clip prompt`:

```ts
  } else {
    // ai-generate: build image prompt with style notes + clip prompt
    const imagePrompt = styleNotes ? `${styleNotes}\n\n${clip.prompt}` : clip.prompt;
    const imgAspect = aspectRatio === 'portrait' ? '9:16' : '16:9';
    const imgRes = await generateImageUseapi({
      prompt: imagePrompt,
      aspectRatio: imgAspect,
      model: 'imagen-4',
    });

    // fifeUrl is a signed URL — download immediately and convert to base64 for downstream upload
    const fetched = await fetch(imgRes.imageUrl);
    if (!fetched.ok) {
      throw new Error(`Failed to download image from useapi (${fetched.status})`);
    }
    const imgBuffer = Buffer.from(await fetched.arrayBuffer());
    const imgBase64 = imgBuffer.toString('base64');
    imageData = `data:image/jpeg;base64,${imgBase64}`;

    const imageFilePath = await saveImage(imageData, generationId, `clip-${clip.index}.jpg`);
    const imagePublicUrl = storagePathToUrl(imageFilePath);
    await db.collection('Generations').updateOne(
      { _id: oid },
      { $set: { 'clips.$[c].generated_image_path': imagePublicUrl } },
      { arrayFilters }
    );
  }
```

Ganti dengan:
```ts
  } else {
    // ai-generate: imageDataUrl sudah dibuat di frontend lewat /api/studio/generate-image preview
    if (!clip.imageDataUrl) {
      throw new Error('imageMode=ai-generate missing imageDataUrl (preview tidak di-generate sebelum Buat Video)');
    }
    imageData = clip.imageDataUrl;
    const imageFilePath = await saveImage(imageData, generationId, `clip-${clip.index}.jpg`);
    const imagePublicUrl = storagePathToUrl(imageFilePath);
    await db.collection('Generations').updateOne(
      { _id: oid },
      { $set: { 'clips.$[c].generated_image_path': imagePublicUrl } },
      { arrayFilters }
    );
  }
```

- [ ] **Step 2: Hapus import generateImageUseapi yang tidak terpakai lagi**

Di baris 3 `worker/runGeneration.ts`, ganti:
```ts
import { uploadImageAsset, createVideoJob, waitForVideo, generateImage as generateImageUseapi } from '../app/lib/useapi';
```

Dengan:
```ts
import { uploadImageAsset, createVideoJob, waitForVideo } from '../app/lib/useapi';
```

- [ ] **Step 3: Hapus parameter aspectRatio yang tidak terpakai (kalau ada)**

Cek apakah `aspectRatio` masih dipakai di `generateClipAssets`. Buka file dan cari penggunaan `aspectRatio` di dalam fungsi tersebut. Kalau `aspectRatio` masih dipakai untuk video createVideoJob, biarkan. Kalau hanya dipakai untuk image (yang kini dihapus), hapus parameter dan call site.

Gunakan grep untuk memastikan:
```bash
grep -n "aspectRatio" /Users/mac/Documents/Bharata-AI/ideamills/worker/runGeneration.ts
```
Expected: aspectRatio masih dipakai di `createVideoJob({ aspectRatio })` — jangan dihapus.

- [ ] **Step 4: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "runGeneration"
```
Expected: tidak ada error.

---

## Task 7: End-to-end verification

**Files:** (no changes — verification only)

- [ ] **Step 1: Jalankan dev server**

```bash
npm run dev
```
Expected: server start tanpa error.

- [ ] **Step 2: Test full TypeScript compile**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```
Expected: tidak ada error baru.

- [ ] **Step 3: Test studio flow end-to-end di browser**

Buka `http://localhost:3000/studio`:
1. Mode "Dari Nol" → upload foto → generate ide → pilih ide → masuk ClipEditor
2. Di ImageSlot clip, klik tombol "AI" 
3. Verifikasi:
   - Tombol AI jadi spinner + disabled
   - Preview slot tampil spinner
   - Tombol Ganti, Asset, Reset masih bisa diklik
4. Tunggu ~10-20 detik
5. Verifikasi:
   - Image preview muncul di slot
   - Tombol AI berubah jadi "Regenerate"
   - Tidak ada error
6. Klik "Regenerate" — image baru di-generate, preview update
7. Klik "Buat Video" → redirect ke `/generations/<id>`
8. Verifikasi worker pakai imageDataUrl yang sudah ada (image generation skip di worker, langsung video)

- [ ] **Step 4: Test edge cases**

1. **Prompt < 10 karakter:** Klik AI → muncul error "Prompt minimal 10 karakter sebelum generate AI image."
2. **Tombol Buat Video disabled saat ai-generate tanpa imageDataUrl:** 
   - Pilih AI mode (set imageMode = 'ai-generate')
   - Tanpa klik AI generate, langsung lihat tombol "Buat Video" — harus disabled
   - Helper text "⚠️ Generate AI image dulu..." muncul di atas tombol

---

## Self-Review Checklist

**Spec coverage:**
- [x] Section 1: Endpoint /api/studio/generate-image → Task 1
- [x] Section 2: Update ImageSlot async → Task 2
- [x] Section 3: ClipEditor pass props → Task 3
- [x] Section 4: Update flow submit (frontend + backend + worker) → Tasks 4+5+6
- [x] Section 5: Validasi UI canSubmit + helper text → Task 3 step 3+5

**Tidak ada placeholder** — semua step punya kode konkret.

**Type consistency:**
- `ImageSlotProps` di Task 2 step 1 — added `clipPrompt`, `styleNotes`, `aspectRatio` — consistent dengan call site di Task 3 step 4
- `ClipEditorProps` di Task 3 step 1 — added `aspectRatio` — consistent dengan call site di Task 4 step 2
- `ClipDraftSchema` di Task 5 — refine matched dengan payload mapping di Task 4 step 1 (ai-generate sekarang send imageDataUrl)
- Worker di Task 6 — `clip.imageDataUrl` field consistent dengan tipe `Clip` di types.ts (sudah nullable string)
- `aspectRatio` parameter di worker `generateClipAssets` — masih dipakai untuk createVideoJob, tidak dihapus
