# Changelog

## [Unreleased]

### Added

**Worker Scalability**
- Job type separation: `standard` (full vision pipeline) vs `structured` (enhanced flow) dengan concurrency terpisah
- `workerConfig.ts` — centralized concurrency + pipeline constants (`STANDARD_CONCURRENCY=2`, `STRUCTURED_CONCURRENCY=6`, `SIMILARITY_THRESHOLD`, dll)
- `workerStats.ts` — rolling average completion time per job type (window 20 jobs) untuk kalkulasi ETA
- `rateLimiter.ts` — MongoDB distributed token bucket; semua worker process berbagi semaphore, mencegah OpenRouter rate limit storm
- `WORKER_ID = hostname:pid` — identity unik per worker process
- `recoverStuckJobs(timeoutMs, excludeWorkerIds)` — stuck recovery tidak cancel job milik worker yang masih hidup
- Exponential backoff retry di `failJob()`: ~30s → ~2m → ~8m
- `GET /api/queue/position` — posisi antrian + ETA (`ceil(ahead/concurrency) × avgMs`)
- `GET /api/worker/health` — queue stats per type, active worker instances, avg completion time

**UX**
- `JobStatus.tsx` — queue position banner dengan ETA real-time (polling setiap 5s saat queued, 3s saat processing)
- `GenerationHistory.tsx` — skeleton loading 5 baris, tampilkan `creative_idea_title` untuk enhanced flow jobs
- `InputForm.tsx` — replace `alert()` dengan inline error banner yang bisa dismiss
- Progress label deskriptif per step pipeline ("Memilih 20 tema unik...", "Membuat visual prompt 2/4...")
- `creative_idea_title` disimpan di Generations dan ditampilkan di history

**Reliability**
- Worker idempotency: `persistScriptsAndScenes` dan `persistStructuredStoryboards` hapus data lama sebelum insert — aman di-retry jika worker crash
- L3 script generation pakai `Promise.allSettled` — 1 tema gagal tidak cancel seluruh generation
- Error tidak reset progress ke 0 — progress dipertahankan untuk debugging
- Embedding dimension mismatch dideteksi eksplisit di `cosineSimilarity()`

**API & Validation**
- Zod validation di semua POST routes
- `storyboardCount` hard cap max 10 di generate-enhanced schema
- Base64 payload validation di `/api/analyze-images`: tolak >7.5MB dengan 413 sebelum kirim ke LLM
- Body size limit dinaikkan ke 10mb di Next.js config untuk route upload dan analyze

**Database**
- Index baru: `Products.product_identifier` (unique), `Models.model_identifier` (unique), `JobQueue.{status,job_type,scheduled_at}` composite, `Scenes.{script_id,order}`, `Ideas.{generation_id}`, `llm_rate_limits.{key}` (unique), `worker_stats.{job_type,completed_at}`
- `Generations.idempotency_key` unique sparse index — prevent duplicate submissions
- Scene documents menyertakan `image_status`, `video_status`, `image_source`, `image_error`, `video_error` saat insert

### Changed

- `middleware.ts` — `limit()` berubah dari in-memory sync bucket ke async MongoDB distributed semaphore
- `queue.ts` — `dequeueJob` sekarang terima `jobType` dan `workerId`, auto-detect job type saat enqueue
- `poll.ts` — dipisah menjadi dua slot (standard + structured), masing-masing independent
- `worker/index.ts` — `initBucket()` dijalankan di startup sebelum worker loop
- `updateGen()` di `runGeneration.ts` — parameter type `any` → `Record<string, unknown>`, hapus defensive `error→error_message` mapping
- Polling interval di `generations/[id]/page.tsx` — 5s saat queued, 3s saat processing (dari 2s flat)
- Sanitize function di `generations/[id]/route.ts` — ~100 baris quote-fixing diganti 8 baris sederhana
- `DBGeneration`, `DBScript`, `DBScene` types di `types.ts` — sync dengan schema MongoDB aktual
- `Variation.directors_script` — dari `any` ke `string`
- `next.config.js` — hapus hardcoded `allowedDevOrigins` IP addresses

### Fixed

- `error:` field di worker error handler — distandarkan ke `error_message:` konsisten dengan DB schema
- `console.log` dibersihkan dari `runGeneration.ts` (72 → 0), `generations/[id]/route.ts`, `generations/route.ts`
- Komentar Supabase lama dihapus dari `runGeneration.ts`

### Removed

- `app/lib/requestLimit.ts` — IP-based rate limiting dihapus (tidak cocok untuk shared network / 200+ users)
- `requester_ip` field dari `JobQueue` documents
- Hardcoded IP addresses dari `next.config.js` (`allowedDevOrigins`)
- Defensive `error → error_message` mapping di `updateGen()`
- `console.log` debug calls di `runGeneration.ts`, upload route, director's script route

---

## [0.1.0] — 2026-02-14

### Added
- Initial commit: IdeaMills platform dengan arsitektur MongoDB-only
- Pipeline L0-L5: Vision → Ideation → Embedding → Scripting → Visual Prompt
- Enhanced flow dengan `creativeIdea` structured payload
- LLM middleware OpenRouter-only dengan model registry dan presets
- MongoDB queue dengan polling worker
- GridFS untuk uploaded images
- UI: InputForm, JobStatus, GenerationHistory, ResultsDisplay, SceneAssetPanel
