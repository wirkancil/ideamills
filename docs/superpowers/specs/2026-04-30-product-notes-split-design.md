# Design: Split styleNotes → productNotes + styleNotes

**Date:** 2026-04-30
**Branch:** feature/studio-clean-flow

## Problem

Saat ini `styleNotes` field menggabungkan **product info** (brand, bentuk produk, label) dengan **visual style** (model, setting, lighting, mood). Ini menyebabkan dua masalah:

1. **Vision sering tidak akurat untuk produk Indonesia** — Gemini tidak kenal brand lokal, sering deteksi jadi generic ("skincare bottle") atau salah brand. User ingin override nama produk dari brief mereka.

2. **Tidak ergonomic untuk edit** — kalau user ingin fix nama produk yang LLM salah deteksi, harus edit gabungan paragraf yang berisi banyak info berbeda. Tidak bisa fokus ke nama produk saja.

3. **Naming misleading** — field bernama `styleNotes` (notes gaya/style) tapi berisi data produk juga. Tidak single responsibility.

## Solution: Split jadi 2 field — productNotes + styleNotes

`productNotes` berisi semua product detail (source of truth: brief user). `styleNotes` berisi visual style saja (model + setting + lighting + mood). Worker dan image-gen prepend keduanya ke clip prompt.

---

## Section 1: DB Schema + Type Updates

**File:** `app/lib/types.ts`

Tambah field `productNotes?: string` ke `DBGeneration` interface (kalau ada). Default `''` saat dibaca.

**File:** `app/api/studio/expand/route.ts`

Saat update Generations setelah expand, simpan productNotes selain styleNotes:

```ts
$set: {
  selectedIdeaIndex,
  creative_idea_title: selectedIdea.title,
  productNotes: result.productNotes,  // BARU
  styleNotes: result.styleNotes,
  clips,
  updated_at: now,
}
```

**Migration:** Tidak butuh — generation lama akan punya `productNotes = undefined`, di-handle dengan fallback `?? ''` saat dibaca.

---

## Section 2: Update LLM Expand Prompt

**File:** `app/lib/llm/prompts.ts`

`EXPAND_USER` saat ini return:
```json
{ "styleNotes": "...", "clips": [{ "prompt": "..." }] }
```

Diubah jadi:
```json
{ "productNotes": "...", "styleNotes": "...", "clips": [{ "prompt": "..." }] }
```

**Aturan baru di prompt:**

1. **`productNotes`** — 1 paragraf berisi:
   - Nama brand dan produk **persis dari brief user** (jangan tebak dari foto kalau brief sudah sebut)
   - Bentuk/form factor produk (botol dropper, tube, dll)
   - Warna kemasan, label color, ukuran
   - Notable text di kemasan
   - **Wajib:** kalau brief sebut nama produk spesifik (misal "GlowBooster 7 Active Ingredients"), pakai persis. Vision foto hanya untuk visual properties (warna, bentuk, posisi label).

2. **`styleNotes`** — 1 paragraf berisi (TANPA product info):
   - Model appearance (umur, gender, ethnicity, hijab/no, pakaian)
   - Setting/lokasi (tembok, sofa, ruangan)
   - Lighting (natural, soft, indoor warm)
   - Tone & mood video

3. **`clip.prompt`** — sama seperti sekarang, tapi tidak boleh duplikat info yang sudah ada di productNotes/styleNotes.

System pipeline prepend `productNotes + styleNotes + clip.prompt` ke Veo dan image-gen.

---

## Section 3: Update LLM Function Signature

**File:** `app/lib/llm/index.ts`

`expandToClips` return type saat ini:
```ts
Promise<{ styleNotes: string; clips: Array<{ prompt: string }> }>
```

Diubah jadi:
```ts
Promise<{ productNotes: string; styleNotes: string; clips: Array<{ prompt: string }> }>
```

Parser di dalam function juga perlu read `parsed.productNotes ?? ''` (default empty kalau LLM tidak return).

**File:** `app/api/studio/expand/route.ts`

Update response JSON ke client — tambah productNotes:

```ts
return NextResponse.json({
  productNotes: result.productNotes,  // BARU
  styleNotes: result.styleNotes,
  clips: clips.map((c) => ({ index: c.index, prompt: c.prompt, imageMode: c.imageMode })),
});
```

---

## Section 4: Update Studio Frontend State + UI

**File:** `app/studio/page.tsx`

Tambah state:
```tsx
const [productNotes, setProductNotes] = useState('');
```

Update `handlePickIdea` (setelah parse response):
```tsx
setProductNotes(data.productNotes ?? '');
setStyleNotes(data.styleNotes ?? '');
```

Update `handleSubmitVideo` body:
```ts
body: JSON.stringify({
  generationId,
  productNotes,
  styleNotes,
  clips: ...,
}),
```

Pass ke `<ClipEditor>`:
```tsx
<ClipEditor
  productNotes={productNotes}
  onProductNotesChange={setProductNotes}
  styleNotes={styleNotes}
  onStyleNotesChange={setStyleNotes}
  ...existingProps
/>
```

**File:** `app/studio/components/ClipEditor.tsx`

Tambah props `productNotes` + `onProductNotesChange` di `ClipEditorProps`. Render di atas `StyleNotesField`:

```tsx
<ProductNotesField value={productNotes} onChange={onProductNotesChange} />
<StyleNotesField value={styleNotes} onChange={onStyleNotesChange} />
```

Pass `productNotes` ke `<ImageSlot>` setiap clip.

**File baru:** `app/studio/components/ProductNotesField.tsx`

Mirror `StyleNotesField.tsx`. Beda:
- Label: "Product Detail"
- Helper text: "Nama brand, bentuk produk, warna kemasan. Edit kalau AI deteksi salah."
- Placeholder: "Contoh: GlowBooster 7 Active Ingredients, botol serum dropper kaca bening..."

---

## Section 5: Update Backend API + Worker + Image Gen

**File:** `app/api/studio/generate/route.ts`

Update zod schema — tambah `productNotes`:
```ts
const RequestSchema = z.object({
  generationId: z.string().min(1),
  productNotes: z.string().max(2000).default(''),
  styleNotes: z.string().max(2000).default(''),
  clips: z.array(ClipDraftSchema).min(2).max(6),
});
```

Note: max styleNotes diubah dari 1500 ke 2000 untuk konsistensi.

Update DB save:
```ts
$set: {
  productNotes,
  styleNotes,
  clips,
  status: 'queued',
  ...
}
```

**File:** `worker/runGeneration.ts`

Update read dari DB:
```ts
const productNotes = (gen.productNotes ?? '') as string;
const styleNotes = (gen.styleNotes ?? '') as string;
```

Tambah helper function di file:
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

Update Veo prompt construction (yang sebelumnya `styleNotes + clip.prompt`):
```ts
const finalPrompt = buildFullPrompt(productNotes, styleNotes, clip.prompt);
```

Update signature `generateClipAssets` — tambah `productNotes`:
```ts
async function generateClipAssets(
  generationId: string,
  clip: Clip,
  productNotes: string,    // BARU
  styleNotes: string,
  productImageUrl: string,
  veoModel: string,
  aspectRatio: 'landscape' | 'portrait'
)
```

Update call site di `processWithConcurrency`.

**File:** `app/api/studio/generate-image/route.ts`

Update zod schema:
```ts
const RequestSchema = z.object({
  prompt: z.string().min(10).max(5000),
  productNotes: z.string().max(2000).optional().default(''),
  styleNotes: z.string().max(2000).optional().default(''),
  aspectRatio: z.enum(['portrait', 'landscape']).optional().default('portrait'),
  model: z.enum(['imagen-4', 'nano-banana-2', 'nano-banana-pro']).optional().default('imagen-4'),
});
```

Update fullPrompt build:
```ts
const parts = [productNotes, styleNotes, prompt].filter((s) => s.trim().length > 0);
const fullPrompt = parts.join('\n\n');
```

**File:** `app/studio/components/ImageSlot.tsx`

Tambah prop `productNotes: string`. Kirim ke fetch body:
```ts
body: JSON.stringify({
  prompt: clipPrompt,
  productNotes,
  styleNotes,
  aspectRatio,
}),
```

ClipEditor pass `productNotes` ke ImageSlot.

---

## Out of Scope

- **Quick Generate mode** — tidak ter-affect. Quick Generate pakai script mentah dari Script Bank, tidak butuh productNotes/styleNotes.
- **Migration data lama** — generation lama yang sudah punya `styleNotes` (gabungan) tetap berfungsi (productNotes default kosong, styleNotes lama tetap di-prepend ke prompt).
- **Auto-extract productNotes dari styleNotes lama** — tidak dilakukan, biarkan generation lama sebagai legacy.

## Risks

1. **LLM tidak return `productNotes`** — kalau Gemini lupa field, parser default `''`. UI menampilkan empty productNotes — user harus isi manual. Acceptable.
2. **User edit productNotes/styleNotes salah** — UI tidak validasi konten, hanya max char. User bisa kosongkan productNotes — clip prompt tetap valid (tidak ada concat issue karena `filter((s) => s.trim().length > 0)`).
3. **Generasi lama (sebelum migrasi)** — productNotes empty, styleNotes lama tetap dipakai. Worker `buildFullPrompt('', styleNotes_lama, clip.prompt)` produces same output as before. Backward compatible.
