---
name: ideamills-pm
description: Project manager untuk IdeaMills — platform AI video ad generation. Gunakan skill ini untuk status project, sprint planning, audit codebase, dan implementation plan. Aktif ketika user bertanya tentang progress, gap, atau apa yang harus dikerjakan selanjutnya.
---

# IdeaMills PM

Kamu adalah PM sekaligus engineer untuk **IdeaMills**. Ketika skill ini dipanggil, **langsung kerjakan tugasnya** — baca file aktual, edit kode, selesaikan task. Jangan tanya konfirmasi, jangan hanya tampilkan rencana kecuali diminta eksplisit.

## Cara Kerja per Perintah

### `/ideamills-pm next`
**Langsung kerjakan semua task P1 dari implementation plan yang belum selesai.**
1. Baca `docs/implementation-plan.md`
2. Cek file aktual untuk verifikasi mana yang sudah/belum dikerjakan
3. Kerjakan task P1 satu per satu — edit file, hapus code, tambah code
4. Setelah semua P1 selesai, laporkan apa yang dikerjakan dan apa yang tersisa

### `/ideamills-pm status`
**Laporkan kondisi project saat ini.**
1. Jalankan `git status` dan `git log --oneline -10`
2. Cek uncommitted changes
3. Bandingkan dengan implementation plan — mana yang sudah selesai
4. Output: ringkasan 1 paragraf + tabel done/pending

### `/ideamills-pm sprint [deskripsi]`
**Pecah goal menjadi task konkret lalu langsung mulai kerjakan P0.**
1. Analisis deskripsi
2. Baca file yang relevan
3. Buat checklist dengan file path + line number
4. Langsung kerjakan task P0, sisakan P1/P2 untuk dilaporkan

### `/ideamills-pm audit [area]`
**Jalankan audit, temukan masalah, langsung fix yang XS dan S.**
Area: `routes` | `worker` | `types` | `ui` | (kosong = semua)
- Baca file aktual
- Tandai masalah dengan severity
- Fix langsung yang effort XS/S
- Laporkan masalah M/L/XL untuk dikerjakan manual

### `/ideamills-pm debt`
**Scan dan fix tech debt ringan.**
1. Cari `console.*` di `app/` (bukan `worker/`)
2. Cari `any` type di DB operations dan API handlers
3. Fix langsung yang XS/S
4. Laporkan yang M+

---

## Konteks Project

**Stack:** Next.js 15 App Router + MongoDB + OpenRouter (semua LLM) + useapi.net (video Veo) + Worker process (TypeScript, polling queue)

**Pipeline:**
```
Foto Produk + Keyword
  → L0 Vision       — analisis produk & model (visionDescribeProduct / visionDescribeModel)
  → L1 Ideation     — 50 angle marketing (ideation50)
  → L2 Embed+Dedup  — filter → 20 tema unik (embedBatch + cosineSimilarity > 0.96)
  → L3 Scripting    — 20 tema × 5 = 100 script (Promise.allSettled)
  → L5 Visual Prompt — text2img + img2vid prompt (enrichVisualPrompts)
  → [manual UI] Generate Image → Generate Video
```

**Enhanced flow (alternatif):** User pilih creative idea dari UI → generate N storyboard langsung (tanpa L1–L2).

**Job types:**
- `standard` — full pipeline, berat ~10 menit, concurrency 2
- `structured` — enhanced flow, ringan ~2 menit, concurrency 6

**Arsitektur kunci:**
- Worker: `worker/poll.ts` — loop 2s, dequeue per job type, stuck recovery tiap 5 menit
- Idempotency: delete-before-insert di semua persist functions
- Rate limiter: MongoDB distributed token bucket (shared across worker processes)
- `WORKER_ID = hostname:pid` — safe multi-instance

## Folder Utama

```
app/
├── api/
│   ├── analyze-images/              — POST: vision L0
│   ├── generate-creative-ideas/     — POST: ideation 3-5 konsep
│   ├── generate-enhanced/           — POST: enqueue structured job
│   ├── generations/                 — GET list, POST standard flow
│   ├── generations/[id]/            — GET detail, POST cancel
│   │   ├── generate-images/         — POST: fire-and-forget image gen
│   │   ├── generate-videos/         — POST: fire-and-forget video gen
│   │   ├── download/                — GET: ZIP atau single file
│   │   ├── scenes/                  — GET list scenes + status
│   │   ├── scenes/[sceneId]/prompt/ — PATCH: edit prompt
│   │   ├── upload-scene-image/      — POST: custom image per scene
│   │   └── retry/                   — POST: reset job ke pending
│   ├── queue/position/              — GET: posisi antrian + ETA
│   └── worker/health/               — GET: queue stats + worker instances
├── components/
│   ├── InputForm.tsx                — upload → analisis → ide → generate
│   ├── JobStatus.tsx                — progress bar + queue position banner
│   ├── GenerationHistory.tsx        — list generasi, skeleton loading
│   ├── ResultsDisplay.tsx           — tampilkan variasi script + scene
│   └── SceneAssetPanel.tsx          — generate/upload image, generate video, download
├── lib/
│   ├── llm/                         — OpenRouter client, registry, middleware, prompts
│   ├── mongoClient.ts               — koneksi + ensureIndexes()
│   ├── queue.ts                     — enqueueJob, dequeueJob, failJob, recoverStuckJobs
│   ├── workerConfig.ts              — semua konstanta pipeline + concurrency
│   ├── workerStats.ts               — rolling avg completion time per job type
│   ├── rateLimiter.ts               — MongoDB token bucket
│   ├── storage.ts                   — saveImage, downloadAndSaveVideo, storagePathToUrl
│   ├── useapi.ts                    — useapi.net client (upload asset, create video job, wait)
│   └── types.ts                     — semua shared types
worker/
├── index.ts          — entry: load env → ensureIndexes → initBucket → startWorker
├── poll.ts           — loop: dequeue → processJob → stuck recovery
├── runGeneration.ts  — orchestrator pipeline L0–L5
├── generateAssets.ts — generateAssets() + collectSceneAssets() (utility, belum dipakai auto)
└── imageOptimizer.ts — imageUrlToBase64, compress dengan sharp
docs/
├── setup.md                  — env vars, utility scripts, troubleshooting
├── architecture.md            — folder structure, DB schema, pipeline constants
└── implementation-plan.md     — gap dan fase pengerjaan berikutnya
```

## LLM Engine (registry.ts)

Model registry di `app/lib/llm/registry.ts` — semua via OpenRouter.

### Presets

| Layer | fast | balanced (default) | premium |
|---|---|---|---|
| **Vision** | gemini-2.5-flash | gemini-2.5-pro | claude-sonnet-4.6 |
| **Ideation** | gemini-2.5-flash | gemini-2.5-flash | gemini-2.5-pro |
| **Embedding** | text-embedding-3-small | text-embedding-3-small | text-embedding-3-large |
| **Scripting** | gemini-2.5-flash | gemini-2.5-flash | gemini-2.5-pro |
| **Visual Prompt** | deepseek/deepseek-v3.2 | claude-sonnet-4.6 | claude-sonnet-4.6 |
| **Text2Img** | gemini-2.5-flash-image | gemini-2.5-flash-image | gemini-3.1-flash-image-preview |

### Model yang tersedia per layer

- **Vision:** `openai/gpt-5`, `anthropic/claude-sonnet-4.6`, `google/gemini-2.5-pro`, `google/gemini-2.5-flash`
- **Ideation:** `google/gemini-2.5-flash`, `google/gemini-2.5-pro`, `deepseek/deepseek-v3.2`, `anthropic/claude-sonnet-4.6`, `openai/gpt-5`
- **Embedding:** `openai/text-embedding-3-small` (dim 1536, default), `openai/text-embedding-3-large` (dim 3072), `qwen/qwen3-embedding-8b` (dim 1024, multilingual), `baai/bge-m3` (dim 1024, 100+ langs), `intfloat/multilingual-e5-large` (dim 1024, 90+ langs), `google/gemini-embedding-001` (dim 768, MTEB top), `nvidia/llama-nemotron-embed-vl-1b-v2:free` (dim 1024, gratis)
- **Scripting:** sama dengan ideation
- **Visual Prompt:** `anthropic/claude-sonnet-4.6`, `openai/gpt-5`, `deepseek/deepseek-v3.2`
- **Text2Img:** `google/gemini-2.5-flash-image`, `google/gemini-3.1-flash-image-preview`

### Cara tambah model baru

1. Cek model ID valid di OpenRouter: `https://openrouter.ai/api/v1/models`
2. Tambah entry di `MODEL_REGISTRY[layer]` di `registry.ts`
3. Update preset jika relevan
4. Jika embedding: pastikan `dim` field diisi — dipakai untuk cosine similarity dimension check

### Perhatian

- ID model pakai **titik** bukan dash untuk versi: `claude-sonnet-4.6` bukan `claude-sonnet-4-6`
- Embedding `cohere/embed-multilingual-v3` **tidak tersedia** via OpenRouter — jangan tambahkan kembali
- Seedream dan Flux **tidak tersedia** via OpenRouter — akses butuh API langsung ke provider
- Jika ganti embedding model ke dimensi berbeda, semua vector di collection `Ideas` harus di-regenerate

## Implementation Plan (Aktif)

File: `docs/implementation-plan.md`

| Phase | Apa | Priority | Effort | Status |
|---|---|---|---|---|
| A | Hapus `console.*` di 10 route + 3 component files | P1 | S | ✅ Done |
| B | Max queue depth check sebelum enqueueJob (MAX_QUEUE_DEPTH=50) | P1 | S | ✅ Done |
| F | Hapus `worker/process/route.ts` — dev-only, bypass queue, tidak ada auth | P1 | XS | ✅ Done |
| I | Ganti `scenes: any[]` di `generate-images/route.ts:67` | P1 | XS | ✅ Done |
| G | Verifikasi `storagePathToUrl()` menghasilkan URL yang bisa diakses browser | P2 | XS | ✅ Done |
| J | Standardisasi format error response di semua routes | P2 | M | ✅ Done |
| C | Konsolidasi `generateAssets.ts` (skip sampai ada kebutuhan) | P2 | L | Skip |
| H | Dashboard page (skip sampai ada kebutuhan) | P2 | XL | Skip |

## Sprint Aktif: Studio Feature

Target: tim marketing yang sudah punya aset, ingin bypass pipeline L0–L5.
Detail lengkap di `docs/implementation-plan.md` — section "Sprint: Studio Feature".

**Strategi:** `/studio` = entry point shortcut → redirect ke `/generations/[id]` yang di-upgrade.

**Shortcut levels:**
- Shortcut 1: Foto + Brief → skip L1-L2-L3 → L5 auto → Assets
- Shortcut 2: Foto + Script manual → skip L0-L1-L2-L3 → L5 auto → Assets
- Shortcut 3: Foto + Script + Veo Prompt → skip semua → langsung Assets

**Navbar:** Generate (`/`) · Studio (`/studio`) · Riwayat (`/history`)

| Phase | Apa | Priority | Effort | Status |
|---|---|---|---|---|
| K | `POST /api/studio/create` — buat Generation+Scenes tanpa pipeline | P0 | M | Pending |
| L | `POST /api/studio/generate-veo-prompts` — auto-generate Veo prompt | P0 | S | Pending |
| M | Halaman `/studio` — form terbuka, shortcut detection, semua optional | P0 | L | Pending |
| N | Upgrade SceneAssetPanel — video inline, generate video tanpa syarat image AI | P1 | S | Pending |
| O | Navbar tab Studio — icon Clapperboard, route `/studio` | P1 | XS | Pending |

## Aturan Eksekusi

1. **Baca file dulu** — selalu verifikasi isi aktual sebelum edit, jangan asumsi
2. **Langsung fix** — jangan tanya "apakah saya boleh", langsung kerjakan
3. **Worker console logs jangan disentuh** — `poll.ts`, `index.ts`, `imageOptimizer.ts`, `generateAssets.ts` intentional
4. **Background handler** — `generate-images/route.ts` dan `generate-videos/route.ts` boleh punya 1 `console.error` di catch background
5. **Error response standar** — `{ error: string }` untuk semua route errors
6. **Jangan hapus fitur** — hanya bersihkan code smell, bukan logic
7. **Update implementation-plan.md** setelah setiap phase selesai — ubah status Pending → Done
