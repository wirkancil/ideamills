# Architecture

## Folder Structure

```
ideamills/
├── app/
│   ├── api/
│   │   ├── analyze-images/        # POST — vision analysis produk + model
│   │   ├── generate-creative-ideas/ # POST — ideation 3-5 konsep kreatif
│   │   ├── generate-enhanced/     # POST — enqueue structured flow job
│   │   ├── generations/           # GET list, POST standard flow
│   │   ├── generations/[id]/      # GET detail + variations, POST cancel
│   │   ├── queue/position/        # GET — posisi antrian + ETA
│   │   └── worker/health/         # GET — health check worker + queue stats
│   ├── components/
│   │   ├── InputForm.tsx          # Form utama: upload → analisis → ide → generate
│   │   ├── JobStatus.tsx          # Status job + progress bar + queue position
│   │   ├── GenerationHistory.tsx  # Daftar generasi dengan skeleton loading
│   │   ├── ResultsDisplay.tsx     # Tampilkan variasi script + scene
│   │   └── SceneAssetPanel.tsx    # Panel generate image/video per scene
│   ├── lib/
│   │   ├── llm/
│   │   │   ├── client.ts          # OpenRouter HTTP client (chat, embed, image)
│   │   │   ├── registry.ts        # Model registry + presets (fast/balanced/premium)
│   │   │   ├── middleware.ts      # retry, parseJson, normalizeImage, logUsage, limit()
│   │   │   ├── rateLimiter.ts     # MongoDB distributed token bucket
│   │   │   ├── prompts.ts         # Semua prompt template per layer
│   │   │   ├── types.ts           # LLMError, LLMMessage, ModelConfig, dll
│   │   │   └── index.ts           # Public API: visionDescribeProduct, ideation50, dll
│   │   ├── mongoClient.ts         # MongoDB connection + ensureIndexes()
│   │   ├── queue.ts               # enqueueJob, dequeueJob, failJob, recoverStuckJobs
│   │   ├── workerConfig.ts        # Concurrency constants + pipeline constants
│   │   ├── workerStats.ts         # Rolling average completion time per job type
│   │   ├── types.ts               # Shared types (JobType, GenerationStatus, DB types, dll)
│   │   └── utils.ts               # stableHash, generateIdempotencyKey
│   ├── dashboard/page.tsx
│   ├── generations/[id]/page.tsx  # Polling + display hasil generasi
│   ├── history/page.tsx
│   └── page.tsx                   # Landing / form utama
├── worker/
│   ├── index.ts                   # Entry point: load env → ensureIndexes → initBucket → poll
│   ├── poll.ts                    # Worker loop: dequeue per type, processJob, stuck recovery
│   ├── runGeneration.ts           # Pipeline orchestrator (L0–L5)
│   └── imageOptimizer.ts          # imageUrlToBase64, compress
├── docs/
├── scripts/                       # Utility CLI (validate:env, check:db, dll)
├── .env.example
└── storage/                       # Generated assets (gitignored)
```

## Pipeline Flow

```
User Input (foto produk + keyword)
   ↓
[UI Step 1] POST /api/analyze-images
   → L0 Vision: visionDescribeProduct() + visionDescribeModel()
   → Parallel, hasil di-cache di collection Products/Models

[UI Step 2] POST /api/generate-creative-ideas
   → Ideation ringan: 3-5 konsep kreatif
   → User pilih 1 konsep

[UI Step 3] POST /api/generate-enhanced  (enqueue job)
   → Job masuk JobQueue (type: 'structured')
   → Worker: processStructuredPayload()
      → Build prompt dari product + model + creativeIdea
      → Generate N storyboard (1 LLM call)
      → persistStructuredStoryboards() — idempotent

[Standard Flow] POST /api/generations  (enqueue job)
   → Job masuk JobQueue (type: 'standard')
   → Worker: runGeneration() full pipeline
      → L1 Ideation: ideation50()
      → L2 Embed+Dedup: embedBatch() + cosineSimilarity > 0.96
      → L3 Scripting: Promise.allSettled(script5 × 20 themes)
      → L5 Visual Prompt: enrichVisualPrompts() in chunks of 25
      → persistScriptsAndScenes() — idempotent
```

## LLM Middleware

Semua LLM call melalui `app/lib/llm/` — pipeline tidak pernah memanggil provider SDK langsung.

```ts
import * as llm from '@/app/lib/llm';

const product = await llm.visionDescribeProduct(imageUrl, basicIdea);
const ideas   = await llm.ideation50(product, basicIdea, modelConfig);
const vectors = await llm.embedBatch(ideas, 50, modelConfig);
const scripts = await llm.script5(theme, modelConfig);
```

### Kenapa OpenRouter?

- 1 API key untuk GPT, Claude, Gemini, DeepSeek, Cohere, Flux, dll
- 1 billing dashboard — kontrol budget per model
- Model per layer bisa diganti user via `modelConfig`
- Built-in fallback: `models: [primary, secondary]`

### Model Presets

```ts
// app/lib/llm/registry.ts
presets: {
  fast:     { vision: 'google/gemini-2.0-flash', ideation: 'deepseek/...', ... }
  balanced: { vision: 'openai/gpt-4.1',           ideation: 'deepseek/...', ... }
  premium:  { vision: 'openai/gpt-4.1',           ideation: 'anthropic/claude-sonnet-4-6', ... }
}
```

### Distributed Rate Limiter

`rateLimiter.ts` menggunakan MongoDB token bucket — semua worker process berbagi satu semaphore. Mencegah OpenRouter rate limit storm saat banyak job paralel.

## Worker

```
worker/index.ts
  └─ ensureIndexes() + initBucket('chat:global', capacity)
  └─ worker/poll.ts
       ├─ WORKER_ID = hostname:pid  (identity per process)
       ├─ loop setiap 2 detik:
       │    dequeueJob('standard')   → max STANDARD_CONCURRENCY = 2 slot
       │    dequeueJob('structured') → max STRUCTURED_CONCURRENCY = 6 slot
       └─ setiap 5 menit: recoverStuckJobs(15min, excludeWorkerIds=[WORKER_ID])
```

**Job types:**
- `standard` — full vision pipeline (berat, ~10 menit)
- `structured` — enhanced flow dengan creativeIdea (ringan, ~2 menit)

**Idempotency:** setiap persist function hapus data lama dulu sebelum insert — aman di-retry jika worker crash.

**Retry dengan exponential backoff:** attempts < max_attempts → reschedule ~30s, ~2m, ~8m.

## Database (MongoDB)

| Collection | Isi |
|---|---|
| `Generations` | Job master: status, progress, progress_label, modelConfig |
| `JobQueue` | Queue: status, job_type, worker_id, attempts, scheduled_at |
| `Scripts` | Generated scripts per generation |
| `Scenes` | Scene breakdown per script (4 scenes: Hook/Problem/Solution/CTA) |
| `Ideas` | Tema unik hasil ideation + embedding |
| `Products` | Cache hasil vision analysis produk (key = hash image) |
| `Models` | Cache hasil vision analysis model/talent |
| `llm_usage` | Log setiap LLM call (tokens, latency, cost) |
| `llm_rate_limits` | Token bucket state untuk distributed rate limiter |
| `worker_stats` | Rolling 20 completion times per job type (untuk ETA) |
| `images` (GridFS) | Uploaded product/model images |

## Queue Position & ETA

`GET /api/queue/position?generationId=xxx` mengembalikan:
```json
{
  "position": 3,
  "ahead": 2,
  "estimatedWaitMs": 240000,
  "jobType": "standard"
}
```

ETA dihitung: `ceil(ahead / concurrency) × avgCompletionMs` — average dari 20 job terakhir di `worker_stats`.

## Pipeline Constants

Semua di `app/lib/workerConfig.ts`:

```ts
STANDARD_CONCURRENCY  = 2    // slot worker untuk standard jobs
STRUCTURED_CONCURRENCY = 6   // slot worker untuk structured jobs
IDEATION_POOL_SIZE    = 50   // kandidat ide sebelum filter embedding
UNIQUE_THEME_TARGET   = 20   // target tema unik setelah dedup cosine
SIMILARITY_THRESHOLD  = 0.96 // threshold cosine similarity untuk dedup
VISUAL_PROMPT_CHUNK   = 25   // scripts per enrichVisualPrompts call
SCENE_CHUNK_SIZE      = 100  // max scenes per MongoDB insertMany
```

## Storage

- **Uploaded images:** MongoDB GridFS (served via `/api/images/[id]`)
- **Generated images/videos:** Local filesystem `./storage/{type}/{jobId}/`
  - Video URL dari useapi.net expire ~24 jam — download segera setelah selesai
