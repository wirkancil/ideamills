# Design: AI Image Preview di ClipEditor

**Date:** 2026-04-30
**Branch:** feature/studio-clean-flow

## Problem

Saat ini tombol "AI" di ImageSlot hanya **set flag** `imageMode = 'ai-generate'` — image baru di-generate worker setelah user klik "Buat Video". User tidak punya kesempatan untuk:

1. Lihat hasil AI image sebelum lanjut ke generate video (yang lambat dan mahal)
2. Regenerate kalau hasil tidak cocok
3. Tahu kalau AI image generation jalan atau gagal

UX bingung — tombol "AI" diklik tidak ada visual feedback, preview slot kosong, dan baru tahu hasil image setelah video selesai.

## Solution: Tombol "AI" langsung trigger image generation dengan preview

Endpoint baru `/api/studio/generate-image` di-trigger saat klik tombol AI. Image di-generate via useapi (Imagen-4), di-preview di ImageSlot, lalu base64 dikirim sebagai bagian dari payload "Buat Video" (worker skip image gen, langsung Veo).

User flow:
1. Klik "AI" di ImageSlot → loading
2. Setelah ~10-20 detik → image preview muncul
3. Kalau tidak cocok, klik "AI" lagi → regenerate
4. Klik "Buat Video" → worker langsung pakai image preview, generate video saja

---

## Section 1: Endpoint baru `/api/studio/generate-image`

**File baru:** `app/api/studio/generate-image/route.ts`

**Request:**
```ts
{
  prompt: string;       // clip prompt (min 10, max 5000)
  styleNotes?: string;  // optional, di-prepend
  aspectRatio?: 'portrait' | 'landscape';  // default 'portrait'
  model?: 'imagen-4' | 'nano-banana-2' | 'nano-banana-pro';  // default 'imagen-4'
}
```

**Response:**
```ts
{
  imageDataUrl: string;        // data:image/jpeg;base64,...
  mediaGenerationId: string;
}
```

**Logic:**
1. Validate request dengan zod
2. Resolve aspect: `portrait → '9:16'`, `landscape → '16:9'`
3. Build prompt: `styleNotes ? styleNotes + '\n\n' + prompt : prompt`
4. Call `generateImage()` dari `app/lib/useapi.ts`
5. Fetch fifeUrl, convert ke base64 data URL
6. Return data URL ke client

**Error handling:** Tangkap error useapi, return 500 dengan friendly message.

---

## Section 2: Update ImageSlot component

**File:** `app/studio/components/ImageSlot.tsx`

**Props baru:**
```ts
interface ImageSlotProps {
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;
  productPreview: string | null;
  clipPrompt: string;          // NEW
  styleNotes: string;          // NEW
  aspectRatio: 'portrait' | 'landscape';  // NEW
  onChange: (mode: ClipImageMode, imageDataUrl?: string | null) => void;
}
```

**State internal baru:**
```ts
const [generating, setGenerating] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Behavior tombol "AI":**

Saat ini:
```ts
onClick={() => onChange('ai-generate', null)}
```

Sesudah:
```ts
onClick={async () => {
  if (clipPrompt.trim().length < 10) {
    setError('Prompt minimal 10 karakter');
    return;
  }
  setGenerating(true);
  setError(null);
  try {
    const res = await fetch('/api/studio/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: clipPrompt,
        styleNotes,
        aspectRatio,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json();
    onChange('ai-generate', data.imageDataUrl);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Gagal generate image');
  } finally {
    setGenerating(false);
  }
}}
disabled={generating}
```

**Visual saat generating:**
- Tombol "AI": spinner icon + disabled
- Tombol Ganti, Asset, Reset tetap aktif
- Preview slot tampilkan placeholder dengan spinner di tengah

**Visual setelah selesai:**
- Preview slot tampilkan image (sama seperti mode `override`)
- Tombol "AI" tetap purple (highlighted)
- Klik "AI" lagi → regenerate

**Error display:** Tampilkan error message kecil di bawah row tombol kalau ada.

---

## Section 3: Update ClipEditor untuk pass props baru

**File:** `app/studio/components/ClipEditor.tsx`

Tambah `aspectRatio` di `ClipEditorProps`:
```ts
interface ClipEditorProps {
  styleNotes: string;
  onStyleNotesChange: (v: string) => void;
  clips: ClipDraft[];
  onClipsChange: (clips: ClipDraft[]) => void;
  productPreview: string | null;
  aspectRatio: 'portrait' | 'landscape';   // NEW
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}
```

Pass props baru ke `<ImageSlot>`:
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

**File:** `app/studio/page.tsx`

Pass `aspectRatio` ke `<ClipEditor>`:
```tsx
<ClipEditor
  ...existingProps
  aspectRatio={aspectRatio}
/>
```

---

## Section 4: Update flow submit "Buat Video"

**File:** `app/api/studio/generate/route.ts`

Update `ClipDraftSchema.refine`:
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

**File:** `app/studio/page.tsx`

Update mapping di `handleSubmitVideo` — sekarang juga kirim `imageDataUrl` untuk mode `ai-generate`:
```ts
clips: clips.map((c) => ({
  index: c.index,
  prompt: c.prompt,
  imageMode: c.imageMode,
  imageDataUrl: (c.imageMode === 'override' || c.imageMode === 'ai-generate')
    ? c.imageDataUrl
    : null,
})),
```

**File:** `worker/runGeneration.ts`

Sederhana-kan blok pemilihan image source. Sebelum:
```ts
} else {
  // ai-generate: panggil useapi generateImage di sini
  const imgRes = await generateImageUseapi({...});
  // fetch fifeUrl, convert ke base64...
}
```

Sesudah:
```ts
} else if (mode === 'ai-generate') {
  // imageDataUrl sudah dibuat di frontend lewat /api/studio/generate-image preview
  if (!clip.imageDataUrl) {
    throw new Error('imageMode=ai-generate missing imageDataUrl (preview tidak di-generate)');
  }
  imageData = clip.imageDataUrl;
}
```

Worker sekarang **tidak perlu** call useapi `generateImage` lagi — selalu pakai data URL dari frontend.

---

## Section 5: Validasi tombol "Buat Video" di ClipEditor

**File:** `app/studio/components/ClipEditor.tsx`

Update `canSubmit`:
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
```

Tampilkan helper text kalau ada clip ai-generate tanpa imageDataUrl:
```tsx
{clips.some((c) => c.imageMode === 'ai-generate' && !c.imageDataUrl) && (
  <p className="text-xs text-amber-600 text-center">
    ⚠️ Generate AI image dulu untuk clip yang dipilih AI mode sebelum Buat Video.
  </p>
)}
```

---

## Out of Scope

- Image model picker (imagen-4 / nano-banana-2 / nano-banana-pro) — pakai default `imagen-4` saja
- Variasi multi-image (4 sekaligus, lalu user pilih) — tetap single image generation
- Persist preview image ke storage server — hanya di state React (refresh = lost, user regenerate)
- Cancel image generation di tengah jalan — user tunggu sampai selesai
- Quick Generate flow — quick-generate selalu pakai foto utama (mode `inherit`), tidak butuh AI image

## Risks

1. **fifeUrl expire saat client masih load** — kecil kemungkinan karena server side sudah download dan convert ke base64 sebelum return ke client.
2. **Base64 image besar di state** — Imagen output bisa 300KB-1MB, dikirim 2x (response generate-image, request generate). Acceptable untuk single clip; kalau multi-clip nanti bermasalah, ganti ke storage temp.
3. **useapi rate limit** — kalau user spam regenerate, bisa kena 429. Mitigasi: tombol disabled saat generating (sudah di section 2).
