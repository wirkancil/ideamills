# Implementation Plan

> Status codebase per 2026-04-21. Semua phase di bawah adalah **belum dikerjakan** — tidak ada stub atau placeholder, ini adalah gap nyata.

## State of the App (Verified)

**Sudah selesai dan berfungsi:**
- Pipeline L0–L5 (vision → ideation → embed → scripting → visual prompt)
- Enhanced flow (user pilih creative idea → generate storyboard)
- Worker dengan job type separation (`standard` / `structured`), concurrency limits, stuck recovery, exponential backoff retry
- Distributed rate limiter (MongoDB token bucket)
- Queue position + ETA API (`/api/queue/position`)
- Worker health API (`/api/worker/health`)
- `SceneAssetPanel.tsx` — UI lengkap: generate images, upload custom, generate videos, download ZIP/single
- `generate-images/route.ts` — fire-and-forget background, p-limit(3), update `image_status`
- `generate-videos/route.ts` — fire-and-forget, upload asset → create job → wait → download
- `download/route.ts` — adm-zip multi-file atau single-file stream
- `scenes/route.ts` — GET list scenes dengan status + URL
- `scenes/[sceneId]/prompt/route.ts` — PATCH update prompt
- `upload-scene-image/route.ts` — upload custom image per scene
- `retry/route.ts` — reset job ke pending
- Zod validation di semua POST routes
- `JobStatus.tsx` dengan queue position banner + ETA polling
- `GenerationHistory.tsx` dengan skeleton loading + `creative_idea_title`
- `InputForm.tsx` dengan inline error banner (tanpa `alert()`)

---

## Phase A — Cleanup Console Logs di Routes & Components

**Priority: P1 — dilakukan pertama karena mempengaruhi noise di production logs**

Sisa `console.*` calls di luar worker (worker console intentional sebagai process logs):

### Routes yang perlu dibersihkan

**`app/api/generations/route.ts`** — 6 console calls (4 di error handler, 2 di catch):
- Baris ~109: `console.error('❌ Generations fetch error:', error)` → hapus atau silent
- Baris ~176–177: `console.error` double logging enqueue error → simpan 1, hapus duplikat
- Baris ~189–192: `console.error` 4 baris di catch → simpan hanya 1 baris (error.message)

**`app/api/generate-enhanced/route.ts`** — `console.error('❌ Enhanced generation error:', error)` → hapus

**`app/api/generate-directors-script/route.ts`** — `console.error('Error generating director script:', error)` → hapus

**`app/api/analyze-images/route.ts`** — `console.error('Image analysis failed:', error)` → hapus

**`app/api/generate-creative-ideas/route.ts`** — `console.error('Error generating creative ideas:', error)` → hapus

**`app/api/generations/[id]/retry/route.ts`** — `console.error('Retry error:', error)` → hapus

**`app/api/worker/process/route.ts`** — 3 console calls → hapus semua (route ini fire-and-forget, error tidak perlu di-log ke stdout)

**`app/api/upload/route.ts`** — `console.error('Upload error:', error)` → hapus

### Components

**`app/components/ResultsDisplay.tsx`** — `console.error(error)` di catch → hapus

**`app/components/InputForm.tsx`**:
- `console.warn('Upload failed but continuing...')` → hapus (sudah ada fallback behavior)
- `console.error('❌ Analysis failed:', error)` → hapus (error ditampilkan di UI banner)

**`app/components/GenerationHistory.tsx`** — `console.error(err)` di catch → hapus

### LLM lib

**`app/lib/llm/index.ts`** — `console.error` di embedBatch retry loop → hapus (error bubble ke caller)
**`app/lib/llm/middleware.ts`** — `console.warn('[llm] failed to log usage:')` → bisa dipertahankan (operational warning)

**File yang disentuh:** 10 route files + 3 component files + 1 lib file
**Effort:** S (< 30 menit)

---

## Phase B — Max Queue Depth Check

**Priority: P1 — proteksi overload server tanpa IP rate limiting**

Saat ini tidak ada batas berapa banyak job yang bisa masuk antrian sekaligus. Dengan 200 user, jika semua submit bersamaan, antrian bisa terisi ratusan job.

### Implementasi

**`app/lib/workerConfig.ts`** — tambah konstanta:
```ts
export const MAX_QUEUE_DEPTH = 50; // total pending jobs maksimal
```

**`app/api/generations/route.ts`** — sebelum `enqueueJob()`, cek total `pending` jobs:
```ts
const pendingCount = await db.collection('JobQueue')
  .countDocuments({ status: 'pending' });
if (pendingCount >= MAX_QUEUE_DEPTH) {
  return NextResponse.json(
    { error: 'Server sedang sibuk. Coba lagi dalam beberapa menit.' },
    { status: 503 }
  );
}
```

**`app/api/generate-enhanced/route.ts`** — sama, tambah cek yang sama sebelum enqueue

**`app/components/InputForm.tsx`** — handle status 503 dari kedua route, tampilkan pesan yang sudah ada di error banner

**File yang disentuh:** `workerConfig.ts`, 2 route files, `InputForm.tsx`
**Effort:** S

---

## Phase C — `generateAssets.ts` Integration (Worker vs API Route)

**Priority: P2 — nice to have, tapi saat ini ada duplikasi logic**

Saat ini ada dua implementasi parallel:
1. `worker/generateAssets.ts` — `generateAssets()` + `collectSceneAssets()` (tidak dipakai oleh siapapun saat ini — worker pipeline tidak otomatis generate assets)
2. `app/api/generations/[id]/generate-images/route.ts` — reimplementasi sendiri (background generateImagesBackground)
3. `app/api/generations/[id]/generate-videos/route.ts` — reimplementasi sendiri

`worker/generateAssets.ts` punya beberapa kelebihan dibanding route implementations:
- Video generation otomatis setelah image done (image → video pipeline dalam 1 pass)
- `onProgress` callback
- `collectSceneAssets()` helper

**Opsi 1 (recommended):** Biarkan status quo — dua implementasi, route-based untuk UI (fire-and-forget dari browser) dan worker-based untuk automation masa depan. Tidak ada bug nyata.

**Opsi 2:** Ekstrak shared logic ke `app/lib/assetGenerator.ts` yang dipakai oleh keduanya.

**Rekomendasi: skip dulu** — tidak ada user-facing bug, refactor ini pure tech debt. Kerjakan jika ada kebutuhan konkret (misal: auto-generate assets setelah pipeline selesai).

---

## Phase D — `worker/generateAssets.ts` Console Cleanup

**Priority: P1 — konsisten dengan Phase A**

`worker/generateAssets.ts` punya 3 `console.warn/error` calls. Worker process logs intentional (poll.ts, index.ts), tapi `generateAssets.ts` dipanggil dari API route juga — perlu diputuskan.

Saat ini `generateAssets.ts` tidak dipanggil oleh siapapun (lihat Phase C). Jika tetap dipertahankan sebagai worker utility:
- `console.warn` dan `console.error` di sana acceptable sebagai worker-side logs
- Tidak perlu diubah

Jika nanti dipindah ke `app/lib/`:
- Hapus semua console calls

**Effort:** XS, skip sampai Phase C diputuskan

---

## Phase E — `generateImage` Export di `app/lib/llm/index.ts`

**Priority: P0 — potential type safety issue**

`generate-images/route.ts` menggunakan `generateImage` dari `@/app/lib/llm` — perlu verifikasi bahwa fungsi ini ter-export dan signature-nya match.

Dari audit: `generateImage` ada di `app/lib/llm/index.ts:297` dan memang di-export. Sudah OK.

**Tidak ada action diperlukan.**

---

## Phase F — `app/api/worker/process/route.ts` Audit

**Priority: P1**

File ini ada (`app/api/worker/process/`) tapi tidak diketahui siapa yang memanggilnya. Dari console logs di sana, route ini tampaknya men-trigger worker secara manual (serverless-style), bukan untuk production.

**Action:**
1. Baca isi lengkap file
2. Jika merupakan serverless worker trigger: dokumentasikan di architecture.md
3. Jika tidak dipakai: pertimbangkan hapus untuk mengurangi attack surface

**Effort:** XS

---

## Phase G — `storagePathToUrl` Consistency

**Priority: P2**

`app/lib/storage.ts:56` — `storagePathToUrl()` mengkonversi path absolut ke URL. Perlu pastikan URL yang dihasilkan bisa diakses oleh browser (ada route `/api/images/[id]` atau file server).

**Perlu dicek:**
- Apakah `./storage/` files served secara langsung oleh Next.js atau butuh API route?
- `scenes/route.ts` menggunakan `storagePathToUrl()` untuk `image_url` dan `video_url` — apakah URL ini benar-benar bisa di-load di browser?

**Effort:** XS (pure investigation, mungkin tidak perlu code change)

---

## Phase H — Dashboard Page

**Priority: P2**

`app/dashboard/page.tsx` saat ini hanya `redirect('/')`. Jika ada rencana membuat dashboard admin/monitoring, ini adalah placeholder-nya.

**Kemungkinan konten:**
- Worker health stats (dari `/api/worker/health`)
- Queue depth live
- Recent generations list
- LLM usage/cost summary (dari `llm_usage` collection)

**Rekomendasi: skip** — tidak ada kebutuhan konkret saat ini.

---

## Phase I — Type Safety di `generate-images/route.ts`

**Priority: P1**

Di `generateImagesBackground()`:
```ts
async function generateImagesBackground(
  db: Awaited<ReturnType<typeof import('@/app/lib/mongoClient').getDb>>,
  genId: string,
  scenes: any[],   // ← any[]
  ...
```

`scenes: any[]` harus diganti dengan tipe yang benar dari `DBScene` atau minimal `{ _id: ObjectId; text_to_image: string }`.

**File:** `app/api/generations/[id]/generate-images/route.ts`
**Effort:** XS

---

## Phase J — Error Response Standardization

**Priority: P2**

Beberapa routes return `{ error: string }`, beberapa return `{ error: string, details: string }`, beberapa return `{ success: false, message: string }`. Tidak konsisten.

**Rekomendasi:** Standardkan ke `{ error: string }` untuk semua error responses, dengan optional `{ error: string, code: string }` untuk error yang perlu di-handle berbeda di frontend.

**File:** semua `route.ts` files
**Effort:** M

---

## Urutan Pengerjaan

| Phase | Priority | Effort | Status |
|---|---|---|---|
| A — Console log cleanup routes & components | P1 | S | ✅ Done |
| B — Max queue depth (MAX_QUEUE_DEPTH=50) | P1 | S | ✅ Done |
| F — Hapus worker/process route (dev-only, bypass queue) | P1 | XS | ✅ Done |
| I — Type safety `scenes: any[]` di generate-images | P1 | XS | ✅ Done |
| G — storagePathToUrl audit | P2 | XS | ✅ Done |
| J — Error response standardization | P2 | M | ✅ Done |
| C — generateAssets consolidation | P2 | L | Skip |
| H — Dashboard page | P2 | XL | Skip |

---

## Sprint: Studio Feature (Shortcut Flow untuk Tim Marketing)

> Ditambahkan 2026-04-22. Target: tim marketing yang sudah punya aset (foto + script) dan ingin bypass pipeline L0–L5.

### Strategi

Bukan halaman terpisah — `/studio` adalah **entry point shortcut** yang detect otomatis level bypass berdasarkan data yang user isi, lalu redirect ke `/generations/[id]` yang di-upgrade.

```
Shortcut 1 — Foto + Brief saja:
  Foto → skip L1-L2-L3 → L5 Visual Prompt otomatis → Assets

Shortcut 2 — Foto + Script manual:
  Foto + Script → skip L0-L1-L2-L3 → L5 Visual Prompt otomatis → Assets

Shortcut 3 — Foto + Script + Veo Prompt:
  Foto + Script + Prompt → skip semua pipeline → langsung Assets
```

### Navbar

3 tab: **Generate** (`/`) · **Studio** (`/studio`) · **Riwayat** (`/history`)

---

### Phase K — API `POST /api/studio/create`

**Priority: P0 — backend shortcut, semua phase lain bergantung ini**

Endpoint baru yang terima payload shortcut dan buat Generation + Scenes langsung di DB tanpa pipeline.

**File baru:** `app/api/studio/create/route.ts`

**Request body (semua optional kecuali shortcut level terdeteksi):**
```ts
{
  productImageUrl: string;          // base64 atau URL
  modelImageUrl?: string | null;
  brief?: string;                   // ide dasar / brief bebas
  scenes?: {                        // jika ada → shortcut 2 atau 3
    struktur: 'Hook' | 'Problem' | 'Solution' | 'CTA' | string;
    naskah_vo: string;
    text_to_image?: string;         // jika ada → shortcut 3
    image_to_video?: string;        // jika ada → shortcut 3
  }[];
  modelConfig?: { preset?: string; text2img?: string; visualPrompt?: string };
}
```

**Logic:**
1. Upload `productImageUrl` dan `modelImageUrl` ke storage (`saveImage`)
2. Buat dokumen `Generations` dengan `status: 'completed'`, `engine: 'studio'`, `product_identifier: 'studio-{timestamp}'`
3. Buat 1 dokumen `Scripts` (theme = brief atau 'Studio Draft')
4. Buat dokumen `Scenes` dari `scenes[]` yang dikirim — jika kosong, buat 4 scenes placeholder (Hook/Problem/Solution/CTA) dengan naskah_vo kosong
5. Jika `image_to_video` tidak ada di scenes → set flag `needs_veo_prompt: true` di generation doc
6. Return `{ generationId, needsVeoPrompt }`

**Tidak ada queue, tidak ada worker** — semua sinkron, selesai dalam <1 detik.

**File:** `app/api/studio/create/route.ts`
**Effort:** M

---

### Phase L — API `POST /api/studio/generate-veo-prompts`

**Priority: P0 — dibutuhkan untuk shortcut 1 dan 2**

Generate `image_to_video` prompt untuk semua scenes dalam 1 generation menggunakan `enrichVisualPrompts`.

**File baru:** `app/api/studio/generate-veo-prompts/route.ts`

**Request body:**
```ts
{
  generationId: string;
  modelConfig?: { preset?: string; visualPrompt?: string };
}
```

**Logic:**
1. Fetch generation + scenes dari DB
2. Panggil `enrichVisualPrompts()` dengan scenes yang ada
3. Update setiap scene dengan `image_to_video` yang dihasilkan
4. Return `{ scenes: [{ id, image_to_video }] }`

**File:** `app/api/studio/generate-veo-prompts/route.ts`
**Effort:** S

---

### Phase M — Halaman `/studio`

**Priority: P0 — UI entry point**

Form terbuka, semua field optional. Auto-detect shortcut level dari apa yang user isi.

**File baru:** `app/studio/page.tsx`

**Sections:**

**1. Aset**
- Upload foto produk (required untuk submit) — drag & drop, preview thumbnail
- Upload foto model (optional)

**2. Brief / Script**
- Textarea bebas — brief, script kasar, atau kosong
- Toggle: "Buat scenes otomatis" vs "Isi scenes manual"

**3. Scenes** (muncul setelah toggle manual, atau setelah generate otomatis)
- Dynamic list — tambah / hapus scene
- Per scene: dropdown struktur (Hook/Problem/Solution/CTA/Custom), textarea naskah_vo
- Foto per scene: "Pakai foto produk" atau upload berbeda

**4. Veo Prompt** (muncul setelah scenes ada)
- Tombol "✨ Generate Veo Prompts" → call Phase L API
- Preview per scene, bisa edit manual

**5. Final**
- Dropdown model text2img
- `[ Generate Image (optional) ]` `[ ▶ Generate Video ]`

**Shortcut detection logic di UI:**
```
Hanya foto → Shortcut 1 (auto semua)
Foto + scenes manual → Shortcut 2
Foto + scenes + veo prompts → Shortcut 3
```

**Submit flow:**
1. Call `POST /api/studio/create` → dapat `generationId`
2. Jika `needsVeoPrompt` → call `POST /api/studio/generate-veo-prompts`
3. Redirect ke `/generations/{generationId}?tab=assets`

**File:** `app/studio/page.tsx`
**Effort:** L

---

### Phase N — Upgrade `SceneAssetPanel`

**Priority: P1 — UX improvement untuk tim marketing**

**N1 — Video player inline** (XS)
- Ganti `<a href>` buka tab baru → `<video controls>` inline di scene card
- Fallback: tombol download jika video tidak bisa di-play inline

**N2 — Generate video tanpa syarat image AI** (S)
- Hapus constraint `disabled={doneImages === 0}`
- Logika baru: video bisa di-generate jika scene punya `image_status === 'done'` (baik dari AI maupun upload custom `image_source === 'user'`)
- Tambah hint text yang lebih jelas: "Upload foto atau generate image dulu per scene"

**N3 — Auto-open tab Assets setelah studio flow** (XS)
- `/generations/[id]?tab=assets` → default tab "Image & Video" terbuka langsung
- Baca `searchParams` di page.tsx, pass sebagai `defaultValue` ke `<Tabs>`

**File:** `app/components/SceneAssetPanel.tsx`, `app/generations/[id]/page.tsx`
**Effort:** S total

---

### Phase O — Navbar update

**Priority: P1 — navigasi**

Tambah tab Studio di `TopBar.tsx`:
- Icon: `Clapperboard` dari lucide-react
- Label: "Studio"
- Route: `/studio`
- Active state: pathname === '/studio'

**File:** `app/components/TopBar.tsx`
**Effort:** XS

---

### Urutan Sprint Studio

| Phase | Apa | Priority | Effort | Status |
|---|---|---|---|---|
| K — `POST /api/studio/create` | Backend shortcut, buat Generation+Scenes tanpa pipeline | P0 | M | ✅ Done |
| L — `POST /api/studio/generate-veo-prompts` | Auto-generate Veo prompt per scene | P0 | S | ✅ Done |
| M — Halaman `/studio` | Form terbuka, semua optional, shortcut detection | P0 | L | ✅ Done |
| N — Upgrade SceneAssetPanel | Video inline, generate video tanpa syarat image AI, tab auto-open | P1 | S | ✅ Done |
| O — Navbar tab Studio | Tambah tab + icon Clapperboard | P1 | XS | ✅ Done |
