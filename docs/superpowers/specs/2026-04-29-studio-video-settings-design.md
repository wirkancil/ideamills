# Studio Punya Aset — Video Settings Design

**Date:** 2026-04-29
**Status:** Draft (pending user review)
**Skill:** superpowers:brainstorming

## Goals

User melaporkan 4 issue saat menggunakan Studio "Punya Aset" untuk generate video iklan:

1. **First frame video adalah foto produk** — user tidak menginginkan produk sebagai first frame; ingin foto model yang jadi first frame (untuk monolog product placement).
2. **Foto model uploaded tapi tidak terkirim ke Google Flow** — `modelImageUrl` disimpan di DB tapi tidak pernah dipakai di pipeline; hanya produk yang di-upload ke useapi.net.
3. **Tidak ada pilihan Veo model** — useapi.net support multiple Veo variants (fast, quality, lite), tapi UI hardcode satu default. User mau bisa pilih.
4. **Tombol "Generate Image" vs "Generate Video" sering ke-salah-pencet** — historis (sebelum refactor Riwayat read-only) ada dua tombol bersebelahan yang membingungkan.

Plus 1 regression yang ditemukan saat eksplorasi:

5. **Studio "Buat Video" → tidak auto-trigger video generation** — setelah refactor Riwayat read-only, tombol manual "Generate Videos" hilang. Studio handleSubmit tidak panggil `/api/generations/[id]/generate-videos`. Akibat: video tidak pernah ke-generate kecuali via curl manual.

Tujuan: rapikan flow Studio Punya Aset jadi 1-page form dengan numbered sections, beri user kontrol explicit atas (a) foto first frame, (b) Veo model, sambil mengirim foto kedua sebagai reference image (R2V) untuk hasil yang lebih konsisten.

## Non-Goals (MVP)

- Studio "Dari Nol" mode tidak diubah (full pipeline tetap existing)
- AI text2img ("Generate Image dengan AI"): tunda sampai OpenRouter aktif
- Veo `count` (multi-output per job): single output cukup
- Veo `endImage`, `referenceImage_2/3`: tunda
- Veo voice narration: tunda
- Veo aspectRatio per scene: tetap landscape default, tidak ada picker
- Mode-specific UI (lite, lite-low-priority, fast-relaxed) — hanya 2 model: fast & quality (sesuai keputusan user)
- Bank Script preset Veo settings: tunda (script bank tetap text-only)

## Design Principles

1. **Explicit over implicit** — user pilih sendiri first frame dan Veo model. Tidak ada default yang diam-diam.
2. **YAGNI** — buang field lama yang silently default (scene.generated_image_path = product). Settings diputuskan per-generation, bukan per-scene.
3. **Sectioning > tab** — 1 form panjang dengan numbered sections kasih flow yang jelas. Avoid tab/wizard yang multi-page.
4. **R2V kalau bisa** — foto yang tidak jadi first frame dikirim sebagai `referenceImage_1` (kalau Veo model support — fast support, quality tidak).
5. **Wiring fix** — Studio "Buat Video" auto-trigger end-to-end (create → generate-videos), tidak perlu user klik tombol kedua di Riwayat.

## Decisions Summary

| Aspek | Keputusan |
|---|---|
| First frame foto picker | Dropdown di Studio: `Foto Model` / `Foto Produk`, **no default** |
| Foto kedua | Otomatis jadi `referenceImage_1` kalau Veo model support R2V |
| Veo model picker | Dropdown 2 pilihan: `veo-3.1-fast` / `veo-3.1-quality`, **no default** |
| Veo Quality + R2V conflict | Allow + warning visible: "Quality tidak support reference image" |
| Studio layout | 1-page form dengan numbered sections (1️⃣ Foto, 2️⃣ Prompt, 3️⃣ Pengaturan Video) |
| CTA button | Cuma 1: "Buat Video" — disabled sampai semua wajib field terisi |
| Studio→Video flow | Auto-trigger `/generate-videos` setelah `/studio/create` di handleSubmit |
| Settings DB storage | Generation level (`first_frame`, `veo_model`), bukan scene level |
| Foto produk | Wajib (existing) |
| Foto model | Wajib **kalau** first_frame === 'model' |
| Validasi | Submit disabled kalau ada wajib field kosong; backend validate juga |
| Scene `generated_image_path` default | **Hapus default ke product** — biarkan null, di-resolve saat generate-videos |

## Architecture

### Files Modified (5)

```
app/studio/page.tsx                          # AssetsForm: tambah Section 3 (Veo + first frame pickers), auto-trigger video gen
app/api/studio/create/route.ts               # Save first_frame + veo_model; hapus default scene.generated_image_path = product
app/api/generations/[id]/generate-videos/route.ts  # Resolve startImage + reference dari generation settings
app/lib/useapi.ts                            # createVideoJob accept referenceImageUrls
app/lib/types.ts                             # Tambah first_frame + veo_model di DBGeneration
```

### No new files. No deletions. No DB migration (additive fields).

## Database Schema Changes

### `Generations` collection

Tambah 2 field opsional (additive, backward compat):

```typescript
interface DBGeneration {
  // existing fields ...
  first_frame?: 'model' | 'product';      // NEW
  veo_model?: 'veo-3.1-fast' | 'veo-3.1-quality';  // NEW
}
```

Generation lama yang tidak punya field ini akan fallback ke behavior existing (treated as `first_frame: 'product'`, `veo_model: 'veo-3.1-fast'`) untuk backward compat saat retry.

### `Scenes` collection

Tidak ada schema change. Tapi behavior berubah:

**Sebelum (broken):** `studio/create` set `scene.generated_image_path = storedProductUrl` (default to product) saat user tidak provide imageDataUrl per scene.

**Sesudah:** `scene.generated_image_path = null` kalau user tidak upload. Di `generate-videos`, di-resolve dari `generation.first_frame` + product/model URLs di Generation level.

Backward compat: scene lama yang sudah punya `generated_image_path` tidak diubah.

## API Changes

### `POST /api/studio/create`

**Request body (added fields):**
```typescript
{
  productImageUrl: string;      // existing, required
  modelImageUrl?: string;       // existing
  brief?: string;               // existing
  scenes?: SceneInput[];        // existing
  first_frame: 'model' | 'product';   // NEW, required
  veo_model: 'veo-3.1-fast' | 'veo-3.1-quality';  // NEW, required
}
```

**Validation:**
- 400 kalau `first_frame` tidak ada atau bukan 'model'/'product'
- 400 kalau `veo_model` tidak ada atau bukan salah satu dari 2 allowed values
- 400 kalau `first_frame === 'model'` tapi `modelImageUrl` tidak ada (or empty/null)

**Persistence:** Save `first_frame` + `veo_model` ke `Generations` doc.

**Removed behavior:** Tidak lagi assign `scene.generated_image_path = storedProductUrl` sebagai default. Scene's `generated_image_path` hanya di-set kalau user provide `imageDataUrl` per scene.

### `POST /api/generations/[id]/generate-videos`

**Request body:** Tidak berubah (tetap optional `sceneIds`).

**Scene filter — CHANGED:**

Sebelum: `{ generated_image_path: { $exists: true, $ne: '' }, image_to_video: { $exists: true, $ne: '' } }`

Sesudah: `{ image_to_video: { $exists: true, $ne: '' } }` — drop `generated_image_path` requirement, karena image bisa di-resolve dari Generation level (`product_image_url` / `model_image_url`) saat runtime.

Validasi tambahan di runtime per scene: kalau resolved `firstFrameImagePath` null/empty → set scene.video_status = 'failed' dengan error: "Tidak ada image untuk first frame".

**Background processing logic — REVISED:**

```typescript
async function generateVideoForScene(scene, generation) {
  const firstFrameChoice = generation.first_frame ?? 'product';  // fallback for legacy
  const veoModel = generation.veo_model ?? 'veo-3.1-fast';        // fallback for legacy
  const supportsR2V = veoModel === 'veo-3.1-fast';                // quality doesn't support
  
  // Resolve images
  let firstFrameImagePath: string;
  let referenceImagePath: string | null = null;
  
  if (scene.generated_image_path) {
    // Per-scene custom image overrides generation-level setting
    firstFrameImagePath = scene.generated_image_path;
  } else {
    firstFrameImagePath = (firstFrameChoice === 'model')
      ? generation.model_image_url
      : generation.product_image_url;
    referenceImagePath = (firstFrameChoice === 'model')
      ? generation.product_image_url
      : generation.model_image_url;
  }
  
  if (!firstFrameImagePath) {
    throw new Error(`Tidak ada image untuk first frame (${firstFrameChoice})`);
  }
  
  // Upload first frame
  const firstFrameBase64 = await loadImageAsDataUrl(firstFrameImagePath);
  const startImageId = await uploadImageAsset(firstFrameBase64);
  
  // Upload reference if applicable
  let referenceImageIds: string[] = [];
  if (supportsR2V && referenceImagePath) {
    const refBase64 = await loadImageAsDataUrl(referenceImagePath);
    const refId = await uploadImageAsset(refBase64);
    referenceImageIds = [refId];
  }
  
  // Create video job
  const jobId = await createVideoJob({
    imageUrl: startImageId,
    referenceImageUrls: referenceImageIds.length > 0 ? referenceImageIds : undefined,
    prompt: scene.image_to_video,
    model: veoModel,
  });
  
  const videoUrl = await waitForVideo(jobId);
  // ... save to DB
}
```

### `app/lib/useapi.ts` — `createVideoJob`

**Updated `VideoGenerateOptions`:**
```typescript
export interface VideoGenerateOptions {
  imageUrl: string;          // startImage (mediaGenerationId)
  prompt: string;
  aspectRatio?: 'landscape' | 'portrait';
  model?: string;
  email?: string;
  referenceImageUrls?: string[];  // NEW: 0–3 mediaGenerationIds, mapped to referenceImage_1..3
}
```

**Body construction:**
```typescript
const body = {
  email: userEmail,
  prompt: opts.prompt,
  model: opts.model ?? 'veo-3.1-fast',
  aspectRatio: opts.aspectRatio ?? 'landscape',
  startImage: opts.imageUrl,
  async: true,
  ...(opts.referenceImageUrls?.[0] ? { referenceImage_1: opts.referenceImageUrls[0] } : {}),
  ...(opts.referenceImageUrls?.[1] ? { referenceImage_2: opts.referenceImageUrls[1] } : {}),
  ...(opts.referenceImageUrls?.[2] ? { referenceImage_3: opts.referenceImageUrls[2] } : {}),
};
```

## UI Specification — Studio "Punya Aset"

### Layout (1-page sectioning)

```
← Kembali

Punya Aset
Upload foto, pilih setting, lalu generate video.

═══════════════════════════════════════════════════════════
1️⃣  Foto
═══════════════════════════════════════════════════════════

  Foto Produk *              Foto Model (optional)
  ┌──────────────┐           ┌──────────────┐
  │  [upload]    │           │  [upload]    │
  └──────────────┘           └──────────────┘

═══════════════════════════════════════════════════════════
2️⃣  Prompt
═══════════════════════════════════════════════════════════

  Brief (optional):
  [textarea]

  Script per Scene:    [📚 Import dari Script Bank]
  
  Scene 1:
  [textarea narasi]
  [+ Tambah Scene]

═══════════════════════════════════════════════════════════
3️⃣  Pengaturan Video
═══════════════════════════════════════════════════════════

  Foto first frame *
  [Pilih dulu... ▼]
    ├ Foto Model
    └ Foto Produk

  Veo Model *
  [Pilih dulu... ▼]
    ├ Fast — $0.05/video, support reference image
    └ Quality — $0.50/video, premium (no reference image)

  ⚠️ (jika Quality dipilih)
  Veo Quality tidak support reference image. Foto yang
  bukan first frame tidak akan dipakai sebagai referensi.

═══════════════════════════════════════════════════════════

  [🎬 Buat Video]
  ↑ Disabled kalau ada wajib field kosong
```

### Validation rules (frontend)

Submit button enabled HANYA kalau:
- `productDataUrl` ada (Foto Produk uploaded)
- `first_frame` selected (bukan empty)
- `veo_model` selected (bukan empty)
- Kalau `first_frame === 'model'`: `modelDataUrl` juga ada
- Setidaknya 1 scene punya narasi non-empty (existing requirement)

Helper text di bawah disabled button: "Lengkapi field bertanda * untuk lanjut."

### Conditional warning

Saat user pilih Veo Model = Quality:

```
⚠️ Veo Quality tidak support reference image. Foto yang
   bukan first frame tidak akan dipakai sebagai referensi.
```

Muncul inline di bawah Veo dropdown, warning style (kuning/amber, bukan error merah).

### handleSubmit (revised)

```typescript
async function handleSubmit() {
  // Validate (also validated in API for safety)
  if (!productDataUrl) { setError('Upload foto produk dulu.'); return; }
  if (!firstFrame) { setError('Pilih foto first frame.'); return; }
  if (!veoModel) { setError('Pilih Veo model.'); return; }
  if (firstFrame === 'model' && !modelDataUrl) {
    setError('Foto model wajib kalau dipilih sebagai first frame.');
    return;
  }
  
  setSubmitting(true);
  setError(null);
  
  try {
    // 1. Create generation
    const createRes = await fetch('/api/studio/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productImageUrl: productDataUrl,
        modelImageUrl: modelDataUrl,
        brief,
        scenes: hasContent ? scenes.map(...) : undefined,
        first_frame: firstFrame,
        veo_model: veoModel,
      }),
    });
    if (!createRes.ok) throw new Error((await createRes.json()).error || 'Gagal membuat draft');
    const { generationId, needsVeoPrompt } = await createRes.json();
    
    // 2. Optional: generate Veo prompts (existing behavior)
    if (needsVeoPrompt) {
      await fetch('/api/studio/generate-veo-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId }),
      });
    }
    
    // 3. NEW: auto-trigger video generation (regression fix)
    await fetch(`/api/generations/${generationId}/generate-videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    
    // 4. Redirect to read-only Riwayat detail (auto-poll for status)
    router.push(`/generations/${generationId}`);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    setSubmitting(false);
  }
}
```

Note: `?tab=assets` query param tidak relevan lagi (Riwayat detail sudah read-only single view), jadi dihapus dari URL.

## Edge Cases

| Scenario | Behavior |
|---|---|
| User pilih first_frame=model tapi modelImageUrl belum upload | Submit button disabled. Helper text muncul. |
| User pilih veo_model=quality + ada model image | Warning muncul, submit allowed, di backend skip referenceImage |
| Generation lama (legacy) tanpa first_frame field | Fallback ke `first_frame: 'product'` (existing behavior) saat retry |
| Generation lama (legacy) tanpa veo_model field | Fallback ke `veo_model: 'veo-3.1-fast'` saat retry |
| User per-scene upload custom image | Tetap pakai scene.generated_image_path sebagai first frame, override generation-level setting; reference image tidak dikirim (single-image flow per scene) |
| Generation gagal di tengah `/generate-videos` | Status scene = 'failed' dengan error message; user lihat di Riwayat detail (read-only). User harus balik ke Studio untuk buat ulang (sesuai design Riwayat read-only sebelumnya). |
| Studio submit tapi generate-videos gagal | Generation tetap tersimpan dengan status 'completed' (dari studio/create), scene video_status = 'failed'. User lihat di Riwayat dengan error per scene. |
| Veo Quality model dipilih, no model image, no product image yet | Tidak mungkin (validation prevents) — productImageUrl wajib |

## Backend Behavior Verification

### Studio create (existing + new):
1. Save Generation dengan first_frame + veo_model (NEW)
2. Save Scenes — `generated_image_path = null` kalau user tidak provide imageDataUrl per scene (CHANGED)

### generate-videos (existing + new):
1. Read generation.first_frame + generation.veo_model
2. Resolve startImage = (first_frame === 'model') ? model_image_url : product_image_url
3. Resolve referenceImage = the OTHER one (kalau Veo model bukan 'quality')
4. Upload startImage ke useapi.net → mediaId_first
5. Upload referenceImage ke useapi.net → mediaId_ref (kalau ada)
6. Call createVideoJob dengan startImage + referenceImage_1 + model
7. Poll, download, save (existing)

## Manual Test Plan

### Validation tests

- [ ] Buka Studio Punya Aset → tombol "Buat Video" disabled
- [ ] Upload foto produk saja → tombol masih disabled (pilih first_frame + veo_model belum)
- [ ] Pilih first_frame=Model → tombol masih disabled (modelImageUrl kosong)
- [ ] Upload foto model → tombol enabled (kalau veo_model sudah dipilih)
- [ ] Pilih veo_model=Quality → warning muncul: "Quality tidak support reference image..."
- [ ] Switch ke veo_model=Fast → warning hilang
- [ ] Submit dengan semua field valid → no error, redirect ke /generations/[id]

### Functional tests

- [ ] **Test A:** first_frame=model + veo_model=fast + upload model + upload produk + prompt
  - Expected: video generated, model di first frame, product visible (sebagai R2V reference)
- [ ] **Test B:** first_frame=product + veo_model=fast + upload produk + upload model + prompt
  - Expected: video generated, product di first frame, model visible (sebagai R2V reference)
- [ ] **Test C:** first_frame=model + veo_model=quality + upload model + upload produk + prompt
  - Expected: video generated, model di first frame only (no R2V), product TIDAK ikut di video (atau hanya muncul kalau prompt mention)
- [ ] **Test D:** first_frame=product + veo_model=quality + upload produk only + prompt
  - Expected: video generated, product di first frame only

### Regression tests

- [ ] Studio Punya Aset → klik Buat Video → tidak perlu klik tombol lain di Riwayat → video auto-generate
- [ ] Riwayat detail menampilkan status "Generating..." dengan auto-poll → setelah ~90s → video play
- [ ] No 500 error di dev server log saat handleSubmit

### Edge cases

- [ ] Generation lama (sebelum migration) di-retry → fallback ke first_frame=product, veo_model=fast → tetap kerja
- [ ] Scene dengan custom imageDataUrl per-scene → tetap pakai itu sebagai first frame, ignore generation-level setting

## Open Questions / Future Iteration

Bukan blocker MVP, bisa ditambah nanti:

1. **Veo lite + relaxed models** — kalau user butuh free option (after fast-relaxed retire May 10), tambah pilihan ke-3
2. **Bank Script preset Veo settings** — script di Bank Script bisa simpan default first_frame + veo_model, otomatis pre-fill saat import ke Studio
3. **Per-scene Veo settings** — beda Veo model per scene (currently global per generation)
4. **Multi-output (count)** — generate 2-4 variants per scene untuk pilih terbaik
5. **endImage / referenceImage_2 + 3** — utilize lebih banyak Veo capabilities
6. **Voice narration** — generate AI voiceover langsung dari Veo
7. **AI text2img integrasi** — Generate Image dengan AI button di Section 1, butuh OpenRouter
