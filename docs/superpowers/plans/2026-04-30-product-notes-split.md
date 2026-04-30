# Product Notes Split + Image Preview Enlargement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `styleNotes` jadi 2 field — `productNotes` (untuk product detail) + `styleNotes` (untuk visual style). Sambil sekalian perbesar preview image di ImageSlot dari thumbnail kecil ke full-width responsive aspect-ratio.

**Architecture:** LLM expand return 3 field (productNotes + styleNotes + clips). Worker dan image-gen prepend `productNotes + styleNotes + clip.prompt`. UI ClipEditor render 2 textarea berdampingan + ImageSlot dengan preview full-width sesuai aspect ratio video. DB tambah field `productNotes` (default empty, backward compatible).

**Tech Stack:** TypeScript, Next.js, MongoDB, OpenRouter, useapi.net, React state

---

## File Map

| File | Aksi | Tanggung jawab |
|------|------|----------------|
| `app/lib/llm/prompts.ts` | Modify | Update `EXPAND_USER` — return productNotes + styleNotes terpisah |
| `app/lib/llm/index.ts` | Modify | Update `expandToClips` return type — tambah productNotes |
| `app/api/studio/expand/route.ts` | Modify | Save productNotes ke DB, return ke client |
| `app/studio/components/ProductNotesField.tsx` | Create | Field "Product Detail" baru, mirror StyleNotesField |
| `app/studio/components/ClipEditor.tsx` | Modify | Tambah props productNotes, render ProductNotesField, pass ke ImageSlot |
| `app/studio/components/ImageSlot.tsx` | Modify | Tambah prop productNotes (kirim ke generate-image), preview full-width aspect-ratio |
| `app/studio/page.tsx` | Modify | State productNotes, pass ke ClipEditor + handleSubmitVideo |
| `app/api/studio/generate/route.ts` | Modify | Zod schema accept productNotes, save ke DB |
| `app/api/studio/generate-image/route.ts` | Modify | Zod schema accept productNotes, prepend ke fullPrompt |
| `worker/runGeneration.ts` | Modify | Read productNotes dari DB, helper buildFullPrompt(p+s+clip) untuk Veo |

---

## Task 1: Update EXPAND_USER prompt — split jadi 3 field

**Files:**
- Modify: `app/lib/llm/prompts.ts`

- [ ] **Step 1: Replace EXPAND_USER body**

Di `app/lib/llm/prompts.ts`, ganti seluruh fungsi `EXPAND_USER` dengan:

```ts
export const EXPAND_USER = (
  productAnalysis: unknown,
  modelAnalysis: unknown,
  selectedIdea: { title: string; content: string },
  brief: string
) => `PRODUK: ${JSON.stringify(productAnalysis)}
MODEL: ${JSON.stringify(modelAnalysis)}
IDE TERPILIH:
  Title: "${selectedIdea.title}"
  Content: ${selectedIdea.content}
BRIEF: "${brief || '(tidak ada)'}"

Tugas:

1. Tulis "productNotes" — 1 paragraf product detail saja:
   - Nama brand dan produk PERSIS dari brief user (jangan tebak dari foto kalau brief sudah sebut)
   - Bentuk/form factor (botol dropper, tube, kemasan box, dll)
   - Warna kemasan, label color, ukuran
   - Notable text di kemasan (kalau ada)
   - WAJIB: kalau brief sebut nama produk spesifik (contoh "GlowBooster 7 Active Ingredients"), gunakan persis. Vision foto hanya untuk visual properties (warna, bentuk, posisi label).
   - JANGAN sertakan info model, setting, atau lighting di sini.

2. Tulis "styleNotes" — 1 paragraf visual style saja:
   - Model appearance: umur, gender, ethnicity, hijab/no, style pakaian
   - Setting/lokasi (tembok, sofa, ruangan, exterior)
   - Lighting (natural, soft, indoor warm, golden hour, dll)
   - Tone & mood video
   - JANGAN sertakan nama produk atau product detail di sini.

3. Tulis SATU "clip" prompt untuk video iklan 8 detik.

   WAJIB dalam prompt:
   a. Model berbicara langsung ke kamera — sertakan dialog Bahasa Indonesia 1-2 kalimat natural, ditulis inline sebagai: model berbicara: "[dialog]"
   b. Lipsync eksplisit: tulis "model berbicara langsung ke kamera, bibir bergerak sinkron dengan ucapan"
   c. Kamera statis: tulis "static camera, fixed tripod position, eye-level framing"
   d. Single take: tulis "single continuous 8-second take"
   e. Clean frame: tulis "clean video frame, only model and product visible, no on-screen graphics"

   DILARANG dalam prompt:
   - Kata "CTA", "call-to-action", "tagline" — ganti dengan deskripsi visual aksi model
   - Negation phrases: "no X", "not X", "tidak X", "tanpa X", "bukan X", "jangan X" — selalu pakai positive equivalent
   - Kata "subtitle", "teks", "tulisan", "overlay"
   - Duplikasi info yang sudah ada di productNotes/styleNotes (sistem akan prepend keduanya otomatis sebelum kirim ke Veo)

   Contoh convert negation ke positive (wajib ikuti):
   - "tidak terlalu terang" → "soft natural indoor lighting"
   - "tidak ada flicker" → "stable steady lighting"
   - "tidak kaku" → "relaxed natural movement"
   - "bukan iklan hard selling" → "authentic conversational tone, feels like genuine product review"
   - "no AI artifacts" → "natural photographic quality with authentic skin texture"
   - "no fast movement" → "slow deliberate motion, calm pacing"

   Format prompt: 1 paragraf naratif, Bahasa Indonesia untuk dialog/VO, Bahasa Inggris untuk technical visual terms. Panjang bebas hingga 5000 karakter.

Return JSON:
{
  "productNotes": "...",
  "styleNotes": "...",
  "clips": [
    { "prompt": "..." }
  ]
}`;
```

- [ ] **Step 2: Verifikasi**

```bash
npx tsx -e "import { EXPAND_USER } from './app/lib/llm/prompts'; const r = EXPAND_USER({brand:'X'},{gender:'female'},{title:'T',content:'C'},''); console.log('Has productNotes:', r.includes('productNotes')); console.log('Has styleNotes:', r.includes('styleNotes')); console.log('Has rule jangan tebak:', r.includes('jangan tebak'));"
```
Expected: semua `true`.

---

## Task 2: Update expandToClips return type

**Files:**
- Modify: `app/lib/llm/index.ts`

- [ ] **Step 1: Ubah return type dan parse logic**

Di `app/lib/llm/index.ts`, cari fungsi `expandToClips` dan ganti dari:

```ts
export async function expandToClips(
  productAnalysis: ProductDescription,
  modelAnalysis: ModelDescription | null,
  selectedIdea: Idea,
  brief: string,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<{ styleNotes: string; clips: Array<{ prompt: string }> }> {
  const { expand } = cfg(config);
  const parsed = await chat<{ styleNotes?: string; clips?: Array<{ prompt: string }> }>(
    jobId,
    'expand',
    expand,
    [
      { role: 'system', content: EXPAND_SYSTEM },
      { role: 'user', content: EXPAND_USER(productAnalysis, modelAnalysis, selectedIdea, brief) },
    ],
    { maxTokens: 3000, responseFormat: 'json_object', timeoutMs: 90_000 }
  );

  const styleNotes = parsed.styleNotes ?? '';
  const clips = parsed.clips ?? [];
  if (!Array.isArray(clips) || clips.length < 1) {
    throw new LLMError('Expand returned 0 clips', 'INVALID_RESPONSE', 'openrouter', expand);
  }
  return { styleNotes, clips };
}
```

Menjadi:

```ts
export async function expandToClips(
  productAnalysis: ProductDescription,
  modelAnalysis: ModelDescription | null,
  selectedIdea: Idea,
  brief: string,
  config?: Partial<ModelConfig>,
  jobId?: string
): Promise<{ productNotes: string; styleNotes: string; clips: Array<{ prompt: string }> }> {
  const { expand } = cfg(config);
  const parsed = await chat<{ productNotes?: string; styleNotes?: string; clips?: Array<{ prompt: string }> }>(
    jobId,
    'expand',
    expand,
    [
      { role: 'system', content: EXPAND_SYSTEM },
      { role: 'user', content: EXPAND_USER(productAnalysis, modelAnalysis, selectedIdea, brief) },
    ],
    { maxTokens: 3000, responseFormat: 'json_object', timeoutMs: 90_000 }
  );

  const productNotes = parsed.productNotes ?? '';
  const styleNotes = parsed.styleNotes ?? '';
  const clips = parsed.clips ?? [];
  if (!Array.isArray(clips) || clips.length < 1) {
    throw new LLMError('Expand returned 0 clips', 'INVALID_RESPONSE', 'openrouter', expand);
  }
  return { productNotes, styleNotes, clips };
}
```

- [ ] **Step 2: Verifikasi TypeScript**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "lib/llm"
```
Expected: tidak ada error baru.

---

## Task 3: Update expand/route.ts — save productNotes ke DB + return

**Files:**
- Modify: `app/api/studio/expand/route.ts`

- [ ] **Step 1: Update DB save dan response**

Di `app/api/studio/expand/route.ts`, cari blok `await db.collection('Generations').updateOne(...)` dan response `NextResponse.json(...)` di akhir try block. Ganti:

```ts
    await db.collection('Generations').updateOne(
      { _id: oid },
      {
        $set: {
          selectedIdeaIndex,
          creative_idea_title: selectedIdea.title,
          styleNotes: result.styleNotes,
          clips,
          updated_at: now,
        },
      }
    );

    return NextResponse.json({
      styleNotes: result.styleNotes,
      clips: clips.map((c) => ({ index: c.index, prompt: c.prompt, imageMode: c.imageMode })),
    });
```

Dengan:

```ts
    await db.collection('Generations').updateOne(
      { _id: oid },
      {
        $set: {
          selectedIdeaIndex,
          creative_idea_title: selectedIdea.title,
          productNotes: result.productNotes,
          styleNotes: result.styleNotes,
          clips,
          updated_at: now,
        },
      }
    );

    return NextResponse.json({
      productNotes: result.productNotes,
      styleNotes: result.styleNotes,
      clips: clips.map((c) => ({ index: c.index, prompt: c.prompt, imageMode: c.imageMode })),
    });
```

- [ ] **Step 2: Verifikasi TypeScript**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "expand/route"
```
Expected: tidak ada error.

---

## Task 4: Buat ProductNotesField component

**Files:**
- Create: `app/studio/components/ProductNotesField.tsx`

- [ ] **Step 1: Create file**

Buat file baru `app/studio/components/ProductNotesField.tsx`:

```tsx
'use client';

import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Package } from 'lucide-react';

interface ProductNotesFieldProps {
  value: string;
  onChange: (v: string) => void;
}

export function ProductNotesField({ value, onChange }: ProductNotesFieldProps) {
  return (
    <div className="space-y-2 border-2 border-dashed rounded-2xl p-4 bg-muted/30">
      <Label className="flex items-center gap-2">
        <Package className="w-4 h-4 text-primary" />
        Product Detail
        <span className="text-xs text-muted-foreground font-normal">
          (nama brand, bentuk produk, warna kemasan)
        </span>
      </Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Contoh: GlowBooster 7 Active Ingredients, botol serum dropper kaca bening, tutup putih, label 'GlowBooster' warna hitam dengan angka '7' merah/oranye besar..."
        rows={3}
        className="text-sm"
        maxLength={2000}
      />
      <p className="text-[10px] text-right text-muted-foreground">{value.length} / 2000</p>
    </div>
  );
}
```

- [ ] **Step 2: Verifikasi TypeScript**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "ProductNotesField"
```
Expected: tidak ada error.

---

## Task 5: Update ClipEditor — render ProductNotesField + pass ke ImageSlot

**Files:**
- Modify: `app/studio/components/ClipEditor.tsx`

- [ ] **Step 1: Update import**

Di `app/studio/components/ClipEditor.tsx`, tambahkan import setelah `StyleNotesField` import:

```tsx
import { ProductNotesField } from './ProductNotesField';
```

- [ ] **Step 2: Tambah props productNotes ke interface**

Cari `interface ClipEditorProps` dan ganti dengan:

```ts
interface ClipEditorProps {
  productNotes: string;
  onProductNotesChange: (v: string) => void;
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

- [ ] **Step 3: Update destructure props**

Cari `export function ClipEditor({...})` dan tambahkan productNotes + onProductNotesChange:

```tsx
export function ClipEditor({
  productNotes,
  onProductNotesChange,
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

- [ ] **Step 4: Render ProductNotesField di atas StyleNotesField**

Cari `<StyleNotesField value={styleNotes} onChange={onStyleNotesChange} />`. Tambahkan `<ProductNotesField ... />` SEBELUM-nya:

```tsx
      <ProductNotesField value={productNotes} onChange={onProductNotesChange} />

      <StyleNotesField value={styleNotes} onChange={onStyleNotesChange} />
```

- [ ] **Step 5: Pass productNotes ke ImageSlot**

Cari `<ImageSlot ... />`. Tambahkan `productNotes` prop:

```tsx
            <ImageSlot
              imageMode={clip.imageMode}
              imageDataUrl={clip.imageDataUrl}
              productPreview={productPreview}
              clipPrompt={clip.prompt}
              productNotes={productNotes}
              styleNotes={styleNotes}
              aspectRatio={aspectRatio}
              onChange={(mode, dataUrl) =>
                updateClip(clip.index, { imageMode: mode, imageDataUrl: dataUrl ?? null })
              }
            />
```

- [ ] **Step 6: Verifikasi TypeScript**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "ClipEditor"
```
Expected: error di studio/page.tsx (akan diperbaiki di Task 7) tapi tidak di ClipEditor.tsx sendiri.

---

## Task 6: Update ImageSlot — accept productNotes + preview full-width

**Files:**
- Modify: `app/studio/components/ImageSlot.tsx`

- [ ] **Step 1: Update interface**

Di `app/studio/components/ImageSlot.tsx`, cari `interface ImageSlotProps` dan tambahkan `productNotes`:

```ts
interface ImageSlotProps {
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;
  productPreview: string | null;
  clipPrompt: string;
  productNotes: string;
  styleNotes: string;
  aspectRatio: 'portrait' | 'landscape';
  onChange: (mode: ClipImageMode, imageDataUrl?: string | null) => void;
}
```

- [ ] **Step 2: Update destructure props**

Cari `export function ImageSlot({...})` dan tambahkan `productNotes`:

```tsx
export function ImageSlot({
  imageMode,
  imageDataUrl,
  productPreview,
  clipPrompt,
  productNotes,
  styleNotes,
  aspectRatio,
  onChange,
}: ImageSlotProps) {
```

- [ ] **Step 3: Update fetch body untuk include productNotes**

Cari `body: JSON.stringify({ prompt: clipPrompt, styleNotes, aspectRatio })` di handler `handleAiGenerate` dan ganti:

```ts
        body: JSON.stringify({ prompt: clipPrompt, productNotes, styleNotes, aspectRatio }),
```

- [ ] **Step 4: Refactor preview ke full-width aspect-ratio**

Cari blok render preview yang dimulai dengan `<div className="flex items-center gap-2 text-xs">` (row tombol). Replace seluruh blok dari `<div className="flex items-center gap-2 text-xs">` sampai `</div>` penutup row tombol (sebelum `{error && (...)}`).

Ganti dari:

```tsx
      <div className="flex items-center gap-2 text-xs">
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

        <span className="text-muted-foreground">
          {imageMode === 'inherit' && 'foto utama'}
          {imageMode === 'override' && 'foto khusus'}
          {imageMode === 'ai-generate' && (imageDataUrl ? 'AI generated' : 'AI generate')}
        </span>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="ml-auto px-2 py-1 rounded-md border hover:bg-muted flex items-center gap-1"
        >
          <Upload className="w-3 h-3" /> Ganti
        </button>

        <button
          type="button"
          onClick={() => setAssetPickerOpen(true)}
          className="px-2 py-1 rounded-md border hover:bg-muted flex items-center gap-1"
          title="Pakai foto dari asset"
        >
          <FolderOpen className="w-3 h-3" /> Asset
        </button>

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

        {imageMode !== 'inherit' && (
          <button
            type="button"
            onClick={() => onChange('inherit', null)}
            className="px-2 py-1 rounded-md border hover:bg-muted text-muted-foreground"
          >
            Reset
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
      </div>
```

Menjadi:

```tsx
      {/* Full-width preview */}
      <div
        className={`w-full rounded-lg border overflow-hidden bg-muted flex items-center justify-center ${
          aspectRatio === 'portrait' ? 'aspect-[9/16] max-h-80' : 'aspect-video'
        }`}
      >
        {generating ? (
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        ) : previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="clip image" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-12 h-12 text-muted-foreground" />
        )}
      </div>

      {/* Status label */}
      <p className="text-xs text-muted-foreground">
        {imageMode === 'inherit' && '📷 Foto utama'}
        {imageMode === 'override' && '🖼️ Foto khusus'}
        {imageMode === 'ai-generate' && (imageDataUrl ? '✨ AI generated' : '✨ AI generate (klik tombol AI)')}
      </p>

      {/* Buttons row */}
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-2 py-1 rounded-md border hover:bg-muted flex items-center gap-1"
        >
          <Upload className="w-3 h-3" /> Ganti
        </button>

        <button
          type="button"
          onClick={() => setAssetPickerOpen(true)}
          className="px-2 py-1 rounded-md border hover:bg-muted flex items-center gap-1"
          title="Pakai foto dari asset"
        >
          <FolderOpen className="w-3 h-3" /> Asset
        </button>

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

        {imageMode !== 'inherit' && (
          <button
            type="button"
            onClick={() => onChange('inherit', null)}
            className="ml-auto px-2 py-1 rounded-md border hover:bg-muted text-muted-foreground"
          >
            Reset
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
      </div>
```

- [ ] **Step 5: Verifikasi TypeScript**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "ImageSlot"
```
Expected: tidak ada error baru.

---

## Task 7: Update studio/page.tsx — state productNotes + pass ke ClipEditor

**Files:**
- Modify: `app/studio/page.tsx`

- [ ] **Step 1: Tambah state productNotes**

Di `app/studio/page.tsx`, cari `const [styleNotes, setStyleNotes] = useState('');` dan tambahkan SEBELUM-nya:

```ts
  const [productNotes, setProductNotes] = useState('');
```

- [ ] **Step 2: Update handlePickIdea untuk parse productNotes**

Cari fungsi `handlePickIdea`. Cari `setStyleNotes(data.styleNotes ?? '');` dan tambahkan SEBELUM-nya:

```ts
      setProductNotes(data.productNotes ?? '');
```

Hasilnya:

```ts
      setProductNotes(data.productNotes ?? '');
      setStyleNotes(data.styleNotes ?? '');
```

- [ ] **Step 3: Update handleSubmitVideo body**

Cari `body: JSON.stringify({` di dalam `handleSubmitVideo`, tambahkan `productNotes,` setelah `generationId,`:

```ts
        body: JSON.stringify({
          generationId,
          productNotes,
          styleNotes,
          clips: clips.map((c) => ({
            index: c.index,
            prompt: c.prompt,
            imageMode: c.imageMode,
            imageDataUrl:
              c.imageMode === 'override' || c.imageMode === 'ai-generate'
                ? c.imageDataUrl
                : null,
          })),
        }),
```

- [ ] **Step 4: Pass productNotes + onProductNotesChange ke ClipEditor**

Cari `<ClipEditor ... />` di render bagian `step === 'edit-clips'`. Tambahkan props productNotes + onProductNotesChange:

```tsx
        {step === 'edit-clips' && (
          <ClipEditor
            productNotes={productNotes}
            onProductNotesChange={setProductNotes}
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

- [ ] **Step 5: Verifikasi TypeScript**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "studio/page"
```
Expected: tidak ada error.

---

## Task 8: Update generate route — accept productNotes di zod schema + DB save

**Files:**
- Modify: `app/api/studio/generate/route.ts`

- [ ] **Step 1: Update RequestSchema**

Di `app/api/studio/generate/route.ts`, cari `const RequestSchema = z.object({`. Ganti:

```ts
const RequestSchema = z.object({
  generationId: z.string().min(1),
  styleNotes: z.string().max(1500).default(''),
  clips: z.array(ClipDraftSchema).min(2).max(6),
});
```

Dengan:

```ts
const RequestSchema = z.object({
  generationId: z.string().min(1),
  productNotes: z.string().max(2000).default(''),
  styleNotes: z.string().max(2000).default(''),
  clips: z.array(ClipDraftSchema).min(1).max(6),
});
```

Catatan: `min(1)` bukan `min(2)` karena flow Dari Nol baru pakai 1 clip.

- [ ] **Step 2: Destructure productNotes + simpan ke DB**

Cari `const { generationId, styleNotes, clips: clipDrafts } = parsed.data;`. Ganti:

```ts
    const { generationId, productNotes, styleNotes, clips: clipDrafts } = parsed.data;
```

Lalu cari `await db.collection('Generations').updateOne(`. Tambahkan `productNotes` ke `$set`:

```ts
    await db.collection('Generations').updateOne(
      { _id: oid },
      {
        $set: {
          productNotes,
          styleNotes,
          clips,
          status: 'queued',
          progress: 0,
          progress_label: 'Antrian video',
          updated_at: now,
        },
      }
    );
```

- [ ] **Step 3: Verifikasi TypeScript**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "generate/route"
```
Expected: tidak ada error.

---

## Task 9: Update generate-image route — accept productNotes + prepend ke fullPrompt

**Files:**
- Modify: `app/api/studio/generate-image/route.ts`

- [ ] **Step 1: Update RequestSchema**

Cari `const RequestSchema = z.object({`. Ganti:

```ts
const RequestSchema = z.object({
  prompt: z.string().min(10).max(5000),
  styleNotes: z.string().max(2000).optional().default(''),
  aspectRatio: z.enum(['portrait', 'landscape']).optional().default('portrait'),
  model: z.enum(['imagen-4', 'nano-banana-2', 'nano-banana-pro']).optional().default('imagen-4'),
});
```

Dengan:

```ts
const RequestSchema = z.object({
  prompt: z.string().min(10).max(5000),
  productNotes: z.string().max(2000).optional().default(''),
  styleNotes: z.string().max(2000).optional().default(''),
  aspectRatio: z.enum(['portrait', 'landscape']).optional().default('portrait'),
  model: z.enum(['imagen-4', 'nano-banana-2', 'nano-banana-pro']).optional().default('imagen-4'),
});
```

- [ ] **Step 2: Update destructure dan fullPrompt build**

Cari `const { prompt, styleNotes, aspectRatio, model } = parsed.data;` dan `const fullPrompt = styleNotes ? \`${styleNotes}\\n\\n${prompt}\` : prompt;`. Ganti:

```ts
    const { prompt, productNotes, styleNotes, aspectRatio, model } = parsed.data;
    const parts = [productNotes, styleNotes, prompt].filter((s) => s.trim().length > 0);
    const fullPrompt = parts.join('\n\n');
    const imgAspect = aspectRatio === 'portrait' ? '9:16' : '16:9';
```

(Catatan: hapus baris `const fullPrompt = styleNotes ? ...` lama sebelum dan baris `const imgAspect = ...` lama.)

- [ ] **Step 3: Verifikasi TypeScript**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "generate-image"
```
Expected: tidak ada error.

---

## Task 10: Update worker — read productNotes + buildFullPrompt helper

**Files:**
- Modify: `worker/runGeneration.ts`

- [ ] **Step 1: Tambah helper function buildFullPrompt**

Di `worker/runGeneration.ts`, di akhir file (setelah `processWithConcurrency` function), tambahkan:

```ts
function buildFullPrompt(
  productNotes: string,
  styleNotes: string,
  clipPrompt: string
): string {
  const parts = [productNotes, styleNotes, clipPrompt].filter((s) => s.trim().length > 0);
  return parts.join('\n\n');
}
```

- [ ] **Step 2: Read productNotes dari DB**

Cari `const styleNotes = (gen.styleNotes ?? '') as string;` di `runV2StudioGeneration`. Tambahkan SEBELUM-nya:

```ts
  const productNotes = (gen.productNotes ?? '') as string;
```

- [ ] **Step 3: Pass productNotes ke generateClipAssets**

Cari call `await generateClipAssets(generationId, clip, styleNotes, productImageUrl, veoModel, aspectRatio);` di processWithConcurrency. Ganti:

```ts
      await generateClipAssets(generationId, clip, productNotes, styleNotes, productImageUrl, veoModel, aspectRatio);
```

- [ ] **Step 4: Update signature generateClipAssets**

Cari `async function generateClipAssets(`. Tambahkan `productNotes: string` SEBELUM `styleNotes: string`:

```ts
async function generateClipAssets(
  generationId: string,
  clip: Clip,
  productNotes: string,
  styleNotes: string,
  productImageUrl: string,
  veoModel: string,
  aspectRatio: 'landscape' | 'portrait'
) {
```

- [ ] **Step 5: Update final Veo prompt construction**

Cari `const finalPrompt = styleNotes ? \`${styleNotes}\\n\\n${clip.prompt}\` : clip.prompt;`. Ganti dengan:

```ts
  const finalPrompt = buildFullPrompt(productNotes, styleNotes, clip.prompt);
```

- [ ] **Step 6: Verifikasi TypeScript**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "runGeneration"
```
Expected: tidak ada error.

---

## Task 11: End-to-end verification

**Files:** (no changes — verification only)

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 2: Test studio flow di browser**

User start dev server sendiri. Buka `http://localhost:3000/studio`:

1. Mode "Dari Nol" → upload foto → masukkan brief detail dengan nama produk spesifik (misal "GlowBooster 7 Active Ingredients") → generate ide → pilih ide
2. Verifikasi ClipEditor muncul dengan **2 field terpisah:**
   - **Product Detail** (di atas, dengan icon Package): berisi nama produk dari brief
   - **Style Notes** (di bawah, dengan icon Sparkles): berisi model + setting + lighting
3. Verifikasi keduanya bisa di-edit
4. Verifikasi preview image di ImageSlot **full-width** dengan aspect ratio sesuai pilihan video (9:16 portrait atau 16:9 landscape)
5. Klik tombol AI → loading spinner besar di tengah preview
6. Setelah image generate, verifikasi muncul di preview full-width
7. Klik Buat Video → worker proses dengan `productNotes + styleNotes + clip.prompt` digabung

- [ ] **Step 3: Test edge cases**

1. **productNotes empty (LLM lupa return)** — UI tampilkan textarea kosong, user bisa isi manual atau biarkan kosong (worker akan filter empty parts)
2. **User clear productNotes manual** — submit Buat Video tetap berhasil, worker pakai styleNotes + clip.prompt saja
3. **Generation lama tanpa productNotes** — buka history generation lama, sistem default productNotes ke '' tanpa error

---

## Self-Review Checklist

**Spec coverage:**
- [x] Section 1: DB Schema + Type Updates → Task 3 (DB save), Task 8 (request schema)
- [x] Section 2: Update LLM Expand Prompt → Task 1
- [x] Section 3: Update LLM Function Signature → Task 2
- [x] Section 4: Update Studio Frontend State + UI → Tasks 4, 5, 7
- [x] Section 5: Update Backend API + Worker + Image Gen → Tasks 8, 9, 10
- [x] Bonus: Image preview enlargement → Task 6 step 4

**Tidak ada placeholder** — semua step punya kode konkret.

**Type consistency:**
- `productNotes` field konsisten di semua layer: zod schema (Task 8, 9), DB save (Task 3, 8), LLM return type (Task 2), Worker read (Task 10), UI state (Task 7), props ImageSlot (Task 6), props ClipEditor (Task 5)
- `expandToClips` return signature di Task 2 — `{ productNotes, styleNotes, clips }` — match dengan response API di Task 3
- `buildFullPrompt(productNotes, styleNotes, clipPrompt)` helper di Task 10 — order konsisten dengan generate-image route (Task 9 step 2)
- `aspectRatio` di Task 6 — pakai `aspect-[9/16]` untuk portrait dan `aspect-video` untuk landscape; `max-h-80` (320px) untuk portrait agar tidak terlalu tinggi
