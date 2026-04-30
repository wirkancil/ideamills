# Riwayat Detail Page — Read-Only Simplification

**Date:** 2026-04-29
**Status:** Draft (pending user review)
**Skill:** superpowers:brainstorming

## Goals

User saat ini mengeluh `/generations/[id]` (halaman detail dari Riwayat) terlalu ribet:
- 2 top-level tabs (Scripts & Variasi, Image & Video)
- Sub-tabs Scene 1..4 + "Naskah Lengkap" per variation
- 4 fields per scene yang sering identik atau kosong (`naskah_vo`, `visual_idea`, `text_to_image`, `image_to_video`)
- Tombol generate/regenerate/upload tersebar di tiap scene card
- Theme filter tabs scrollable di atas

Tujuan revisi: **simplifikasi ekstrem** dengan memisahkan tanggung jawab UI:
- **Studio** = create + edit + upload (mutations only)
- **Riwayat detail (`/generations/[id]`)** = pure view + download (read-only)

Tidak ada tombol mutation di Riwayat detail. Halaman jadi minimal: status + scene cards berisi image + video + prompt reference + download. User yang mau ubah prompt atau re-generate harus balik ke Studio.

## Non-Goals (MVP)

Eksplisit ditunda:

- Mengubah Studio "Punya Aset" form (sudah cukup simpel)
- Mengubah Studio "Dari Nol" form
- Mengubah Bank Script feature (baru selesai dibangun)
- Memodifikasi schema DB (`Generations`, `Scripts`, `Scenes` tetap utuh)
- Memodifikasi pipeline pipeline backend (worker, useapi.net, OpenRouter)
- Memodifikasi API routes existing — UI hanya konsumsi, tidak ubah endpoint
- "Re-generate dari Riwayat" inline (user navigate ke Studio manual)
- "Tweak prompt dari Riwayat" inline (user navigate ke Studio manual)
- "Variasi cepat" / "duplicate generation" — tunda
- Side-by-side comparison antar variation
- Bulk action (select multiple scenes / generations)
- Bulk download dari Riwayat list
- Theme/variation filtering UI di list `/history` (sudah simpel, tidak diubah)

## Design Principles

1. **Pemisahan tanggung jawab keras**: Studio = action; Riwayat = view.
2. **YAGNI**: Hilangkan field/tab/button yang tidak digunakan oleh majoritas user (Bank Script + Punya Aset flow).
3. **Field DB tidak berubah**, hanya UI yang re-organize. Backward-compat dengan "Dari Nol" pipeline.
4. **1 prompt = 1 truth**: UI tampilkan satu field "Prompt" yang map ke `image_to_video` (yang dipakai Veo). Field lain (`naskah_vo`, `visual_idea`, `text_to_image`) tetap di DB tapi tidak di-display di Riwayat.
5. **Multi-variation jarang dipakai** → kalau ada, jadikan dropdown picker (bukan tabs/sub-tabs).
6. **Naskah Lengkap (directors_script)** opsional → modal yang bisa dibuka, bukan tab default.

## Decisions Summary

| Aspek | Keputusan |
|---|---|
| `/generations/[id]` mode | Read-only (pure view + download) |
| Tabs di detail page | Hilang total (no Tabs component) |
| Field display per scene | 1 field "Prompt" (= `image_to_video` value) |
| Multi-variation handling | Dropdown picker di header, default variation pertama |
| Multi-scene per variation | Flat list cards, no sub-tabs |
| Naskah Lengkap | Tombol "Lihat Naskah Lengkap" → modal/drawer (hanya kalau `directors_script` ada) |
| Theme filter (multi-variation) | Dropdown picker (hanya kalau ≥2 themes) |
| Scene mutation buttons | Dihilangkan (Edit Prompt, Regenerate Image, Upload Image, Generate Images, Generate Videos) |
| Download buttons | Tetap (per video + Download Semua ZIP) |
| Failed generation handling | Tampilkan error + tombol "Buat Ulang di Studio" → navigate ke `/studio` |
| Studio | Tidak diubah |
| API routes | Tidak diubah (mutations existing tetap, hanya tidak dipanggil dari Riwayat) |

## Architecture

### File Structure Changes

```
app/
├── generations/[id]/
│   └── page.tsx                          # MAJOR REWRITE — pure read-only view
├── components/
│   ├── ResultsDisplay.tsx                # DELETE (replaced by GenerationView)
│   ├── SceneAssetPanel.tsx               # DELETE (replaced by SceneViewCard)
│   ├── GenerationView.tsx                # NEW — read-only generation view (replaces both above)
│   ├── SceneViewCard.tsx                 # NEW — read-only scene card
│   ├── DirectorsScriptModal.tsx          # NEW — optional modal for Naskah Lengkap
│   └── VariationPicker.tsx               # NEW — dropdown for multi-variation generation
├── lib/
│   └── (unchanged)
└── api/
    └── (unchanged — mutations API tetap, hanya tidak dipanggil dari Riwayat)
```

### Components to Delete

- `app/components/ResultsDisplay.tsx` (612 lines, complex tab tree) — replaced
- `app/components/SceneAssetPanel.tsx` (542 lines, includes mutation buttons) — replaced

### Components to Create

- `app/components/GenerationView.tsx` — top-level view, handles status, variation picker, scene list
- `app/components/SceneViewCard.tsx` — read-only scene card (image + video + prompt + download MP4)
- `app/components/DirectorsScriptModal.tsx` — optional modal triggered by button "Lihat Naskah Lengkap"
- `app/components/VariationPicker.tsx` — dropdown for switching variations (only when >1)

### File Modified

- `app/generations/[id]/page.tsx` — full rewrite, remove `Tabs`, mount `GenerationView`

## Page Layout (Read-Only)

### Successful Generation

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Kembali ke Riwayat                                            │
│                                                                  │
│ <Title from product / first script theme>                        │
│ <Status badge>  <Date>  <Scene count>  <Model name>             │
│                                                                  │
│ [📜 Lihat Naskah Lengkap]  ← only if directors_script available │
│ [Variasi: Default ▼]       ← only if >1 variation               │
│                                          [📥 Download Semua ZIP]│
├─────────────────────────────────────────────────────────────────┤
│ Scene 1                                          [✓ Selesai]    │
│ ┌──────────────┐  ┌──────────────────────────────────────┐     │
│ │   [image]    │  │         [video player]               │     │
│ └──────────────┘  └──────────────────────────────────────┘     │
│ ┌─ Prompt ───────────────────────────────────────────────┐     │
│ │ <truncated 2-3 lines>  [▶ Tampilkan lengkap]           │     │
│ └────────────────────────────────────────────────────────┘     │
│                                            [📥 Download MP4]    │
├─────────────────────────────────────────────────────────────────┤
│ Scene 2                                          [✓ Selesai]    │
│ ...                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Failed Generation

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Kembali ke Riwayat                                            │
│                                                                  │
│ <Title>                                  [✗ Gagal]              │
│ 29 Apr 2026                                                      │
│                                                                  │
│  ⚠️  Generation gagal                                           │
│      <error message>                                             │
│                                                                  │
│      [🎬 Buat Ulang di Studio]                                  │
└─────────────────────────────────────────────────────────────────┘
```

### In-Progress Generation (queued / processing)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Kembali ke Riwayat                                            │
│                                                                  │
│ <Title>                              [⏳ Generating... 45%]      │
│ 29 Apr 2026                                                      │
│                                                                  │
│  Sedang memproses pipeline. Halaman akan auto-refresh.           │
│  <progress bar>                                                  │
│  <progress label e.g. "L3: Generating script 12/20">             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Auto-poll API setiap 5 detik selama status = `queued` / `processing`. Stop polling saat `succeeded` / `failed`.

## Component Specifications

### `GenerationView` (top-level)

**Props:**
```ts
interface GenerationViewProps {
  generationId: string;
}
```

**State:**
- `generation: DBGeneration | null`
- `variations: Variation[]` (paginated)
- `selectedVariationIdx: number` (default 0)
- `scenes: SceneAssetState[]` (scenes for selected variation)
- `loading: boolean`
- `error: string | null`

**Behavior:**
- On mount: fetch `/api/generations/[id]?page=1&pageSize=20`
- Auto-poll every 5 sec while status is `queued` or `processing`
- Render based on status:
  - `succeeded` → header + variation picker (if >1) + scene list
  - `failed` → error card + CTA to Studio
  - `queued` / `processing` → progress card with auto-poll
- When variation changes, re-fetch scenes for selected variation

**Doesn't render any mutation button.** No edit, no upload, no generate.

### `SceneViewCard` (per scene)

**Props:**
```ts
interface SceneViewCardProps {
  scene: SceneAssetState;
  sceneIdx: number;
}
```

**Render:**
- Header: `Scene {N}` + status badge
- Image preview (left, ~200px) + Video player (right, ~600px)
  - If `image_url` exists, show `<img>`
  - If `video_url` exists, show `<video controls>`
  - If neither, show placeholder
- Prompt display (collapsed by default, expandable):
  - Show first 2 lines of `scene.image_to_video` (or `scene.naskah_vo` as fallback if `image_to_video` empty)
  - Click "Tampilkan lengkap" → expand
- Download button:
  - Only show if `video_url` exists
  - Click → trigger browser download of `video_url` (or call existing `/api/generations/[id]/download?type=videos&sceneId=X` if exists)

**No edit. No upload. No retry button.**

### `DirectorsScriptModal` (optional modal)

**Props:**
```ts
interface DirectorsScriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: string;  // directors_script content
}
```

**Render:**
- Dialog (shadcn/ui)
- Title: "Naskah Lengkap (Director's Script)"
- Body: pre-formatted text or markdown render of `directors_script`
- Footer: Close button + "Copy to Clipboard" button

**Hanya muncul kalau `variation.directors_script` ada di response API.**

### `VariationPicker` (header dropdown)

**Props:**
```ts
interface VariationPickerProps {
  variations: Variation[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}
```

**Render:**
- Dropdown menu (shadcn `Select`)
- Items: `Variasi 1: <theme>`, `Variasi 2: <theme>`, ...
- If `variations.length === 1`, hide entirely (don't render).

## Data Flow

### Loading the page

```
User klik generation di /history
   ↓
Browser navigate /generations/[id]
   ↓ Page mount
GenerationView paralel fetch:
   1. GET /api/generations/[id]?page=1&pageSize=20
      → response: { status, variations, themeCounts, ... }
      → variations berisi: { id, theme, directors_script?, scenes: [...] } per variation
   2. GET /api/generations/[id]/scenes
      → response: { scenes: SceneAssetState[] }
      → setiap scene punya: image_url, video_url, image_status, video_status, scriptId
   ↓
Render based on status:
   - succeeded:
       ↓ Default variation = variations[0]
       ↓ Filter scenes by variation: kalau >1 variation, filter scenes by scriptId
         yang match variation tersebut. Kalau 1 variation, semua scenes ditampilkan.
       ↓ render SceneViewCard per scene yang ter-filter
   - failed → render error card with CTA
   - in-progress → render progress + auto-poll setiap 5s
```

**Data sources:**
- Prompt content per scene → `scene.image_to_video` (atau fallback `scene.naskah_vo`)
- Image / video URL → `scene.image_url` / `scene.video_url` dari `/api/generations/[id]/scenes`
- Status badge → `scene.image_status` & `scene.video_status` dari `/api/generations/[id]/scenes`
- Variation list + `directors_script` → dari `/api/generations/[id]` response
- Theme name (untuk variation picker) → `variation.theme`

### Switching variation (multi-variation case)

```
User pick variation in dropdown (idx X)
   ↓ setSelectedVariationIdx(X)
Already have variations[X].scenes from initial fetch
   ↓ re-render scene list
(No additional API call)
```

### Download single video

```
User klik [📥 Download MP4] di Scene N
   ↓
Browser navigate (download attribute) ke scene.video_url
   ↓
Browser download file
```

### Download all (ZIP)

```
User klik [📥 Download Semua ZIP]
   ↓
Browser open new tab: /api/generations/[id]/download?type=all
   ↓
Server stream ZIP berisi semua image + video
```

(Endpoint `/api/generations/[id]/download` existing dipakai apa adanya.)

### Failed generation: "Buat Ulang di Studio"

```
User klik [🎬 Buat Ulang di Studio]
   ↓
Navigate ke /studio
   ↓
(Future improvement: pass query params untuk pre-fill — out of scope MVP)
```

MVP: cuma redirect plain `/studio`. Tidak pre-fill (akan ditambah kalau perlu).

### Auto-polling for in-progress

```
GenerationView mounts dengan status = 'queued' atau 'processing'
   ↓ setInterval(fetchGeneration, 5000)
Update state on each poll
   ↓ if status changes to succeeded/failed → clearInterval
   ↓ render appropriate view
```

## Edge Cases

| Scenario | Behavior |
|---|---|
| Generation tidak ditemukan (404) | Tampilkan "Generation tidak ditemukan" + tombol "Kembali ke Riwayat" |
| Generation succeeded tapi `variations.length === 0` | Tampilkan "Tidak ada hasil" + CTA Studio |
| Variation tanpa `directors_script` | Sembunyikan tombol "Lihat Naskah Lengkap" |
| Scene tanpa `video_url` | Sembunyikan tombol "Download MP4", tampilkan badge "Belum ada video" |
| Scene tanpa `image_url` dan tanpa `video_url` | Tampilkan placeholder kosong + status badge |
| `image_to_video` kosong tapi `naskah_vo` ada | Display `naskah_vo` sebagai prompt fallback |
| Semua field prompt kosong | Tampilkan "Prompt tidak tersedia" |
| Auto-poll gagal (network error) | Retry diam-diam 3x dengan backoff, lalu tampilkan banner "Koneksi terputus, refresh halaman" |
| User refresh halaman saat generating | Re-fetch dari awal, melanjutkan poll |

## Behaviors Tidak Boleh Ada Lagi (Removed)

- ❌ Edit prompt textarea per scene
- ❌ "Regenerate Image" button
- ❌ "Upload Image Sendiri" button
- ❌ "Generate Images (semua/N)" button
- ❌ "Generate Videos (siap/N)" button
- ❌ "Pilih Semua" / "Reset Pilihan" / scene checkbox
- ❌ "Retry" button per scene (image atau video)
- ❌ Tab "Scripts & Variasi" / Tab "Image & Video"
- ❌ Sub-tabs "Scene 1..4" / "Naskah Lengkap"
- ❌ Theme filter tabs (scrollable)
- ❌ "Failed summary banner" dengan retry buttons
- ❌ Display fields `naskah_vo`, `visual_idea`, `text_to_image` (hidden, hanya `image_to_video` sebagai "Prompt")

## API Routes (Tidak Diubah)

Endpoint berikut tetap ada di codebase, tetap dipanggil oleh Studio (untuk action), tapi tidak dipanggil lagi oleh Riwayat detail:

- `POST /api/generations/[id]/generate-images` — Studio (mutation)
- `POST /api/generations/[id]/generate-videos` — Studio (mutation, sudah ada call dari Studio Punya Aset)
- `POST /api/generations/[id]/upload-scene-image` — Studio (mutation)
- `PATCH /api/generations/[id]/scenes/[sceneId]/prompt` — Studio (mutation)
- `POST /api/generations/[id]/retry` — Studio (mutation)

Endpoint berikut **tetap dipakai** oleh Riwayat detail (read-only):

- `GET /api/generations/[id]` — fetch generation + variations
- `GET /api/generations/[id]/scenes` — fetch scene assets
- `GET /api/generations/[id]/download?type=...` — download files (read-side, tidak mutate)

## Component Removal Plan

`ResultsDisplay.tsx` dan `SceneAssetPanel.tsx` di-delete. Untuk safety:
1. Pastikan tidak ada import ke kedua file ini di luar `/generations/[id]/page.tsx`
2. Grep verify zero usage di seluruh codebase before delete
3. Delete file
4. Delete dead code di `lib/` yang hanya dipakai oleh kedua component (kalau ada)

## Visual Style

Konsisten dengan IdeaMills existing:
- Border radius `rounded-xl` / `rounded-2xl`
- Border 2px untuk emphasis
- Color: primary untuk active state, muted-foreground untuk meta
- Spacing `space-y-6` section, `space-y-3` inner
- Bahasa: Indonesia konsisten

## Responsive

- Desktop: image (200px) + video (600px) side-by-side per scene
- Tablet: image (180px) + video (480px) side-by-side
- Mobile: image (full width thumbnail 16:9) + video (full width) stacked

## Manual Test Plan

### Read-only behavior

- [ ] Buka `/generations/[id]` dari Riwayat → tidak ada tabs apapun
- [ ] Tidak ada button "Edit", "Regenerate", "Upload", "Generate Images", "Generate Videos"
- [ ] Tidak ada checkbox "Pilih Semua" / "Reset Pilihan"
- [ ] Tidak ada theme filter tabs
- [ ] Klik prompt → expand/collapse (text-only, tidak editable)

### Successful generation

- [ ] Variation count == 1 → variation picker dropdown TIDAK muncul
- [ ] Variation count > 1 → dropdown muncul, default variation pertama
- [ ] `directors_script` ada → tombol "Lihat Naskah Lengkap" muncul → klik → modal terbuka dengan teks
- [ ] `directors_script` null → tombol "Lihat Naskah Lengkap" TIDAK muncul
- [ ] Scene dengan `image_url` + `video_url` → tampil image preview + video player
- [ ] Klik [Download MP4] → browser download file
- [ ] Klik [Download Semua ZIP] → buka tab download endpoint

### Failed generation

- [ ] Status `failed` → tampil error card + CTA "Buat Ulang di Studio"
- [ ] Klik CTA → navigate ke `/studio`
- [ ] Tidak ada button "Retry" inline

### In-progress generation

- [ ] Buka generation status `queued` → tampil "Sedang memproses" + progress bar
- [ ] Auto-poll setiap 5 detik (verify via DevTools Network)
- [ ] Status berubah ke `succeeded` → halaman re-render ke success view
- [ ] Status berubah ke `failed` → halaman re-render ke failed view
- [ ] Browser refresh → re-fetch + lanjutkan poll

### Edge cases

- [ ] Generation 404 → "Tidak ditemukan" + back button
- [ ] Variation tanpa scenes → "Tidak ada hasil" empty state
- [ ] Scene tanpa video_url → tombol Download MP4 hidden, tampil badge "Belum ada video"

### Cross-feature

- [ ] Studio create generation → redirect ke `/generations/[id]` → tampil read-only view (sukses jalan)
- [ ] Bank Script → Studio Punya Aset → "Buat Video" → setelah generate selesai → tampil video play di Riwayat detail tanpa tab/edit button
- [ ] Existing "Dari Nol" generation lama → tetap tampil dengan UI baru (multi-variation dropdown muncul, tabs hilang)

### Production readiness

- [ ] `npm run build` pass
- [ ] No console.error di browser saat normal browsing
- [ ] Bahasa Indonesia konsisten di semua copy
- [ ] Responsive di desktop / tablet / mobile

## Open Questions / Future Iteration

Tidak diblok untuk MVP, bisa ditambah nanti:

1. **"Buat Ulang di Studio" pre-fill** — pass query params (`?prefill=<generationId>`) supaya Studio fetch generation lama dan auto-fill form
2. **Side-by-side compare** — klik 2 generation di Riwayat → page comparison
3. **Tag / favorite generation** — bookmark hasil terbaik
4. **Share link** — generate public URL untuk video result
5. **Duplicate generation** — clone with same params, tweak before re-create
6. **Studio "Edit dari Generation"** — load past generation as Studio starting point untuk new run
