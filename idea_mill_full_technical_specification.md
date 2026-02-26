# IdeaMill — Full Technical Specification

> **Purpose**: IdeaMill generates **100 storyboard-ready ad variations** from a product image (required), optional model image, basic idea, and chosen ideation engine (GPT-4o or Gemini 1.5 Pro). It deduplicates concepts using **pgvector** memory, guarantees visual consistency, and outputs JSON suitable for downstream production.

---

## 0. Executive Summary
- **Stack**: Next.js (App Router) full‑stack; API Routes on Node.js; Supabase (Postgres + `pgvector`); OpenAI (GPT‑4o, Vision, Embeddings), Google Gemini 1.5 Pro.
- **Pattern**: **Async job orchestration** (enqueue → worker) to avoid HTTP timeouts and enable retries, throttling, and observability.
- **Output**: 100 variations, each 3–4 scenes (Hook, Problem, Solution, CTA) with **VO** and **visual prompts** (`text_to_image`, `image_to_video`).
- **Memory**: `Ideas` table (1536‑dim vectors) with semantic filtering (adaptive thresholds; scoped to product and category).
- **Ops**: Token/latency logging, cost tracking, and structured alerts; RLS for multi‑tenant deployments.

---

## 1. High‑Level Architecture

**Flow**
1) **Frontend** uploads images → Supabase Storage (signed URL) and submits generation request.
2) **API** `/api/generations` creates an **idempotent** job (hash of inputs), persists a `Generations` row, enqueues work (BullMQ / Cloud Tasks / Temporal).
3) **Worker** executes steps L0–L5 (Vision → Ideation(50) → Embed/Filter → Script(20×5) → Visual prompts (chunked) → Persist), posts progress to DB.
4) **UI** polls `/api/generations/:id` (or subscribes via Realtime) and paginates results.

```
Browser ──(upload)──▶ Supabase Storage
   │                       │
   ├─(POST) /api/generations (create job) ───▶ DB: Generations (status=queued)
   │                                          └▶ Queue (job)
   └─(GET) /api/generations/:id (progress/results)

Worker ◀── Queue  ──▶ OpenAI/Gemini ──▶ Supabase (Ideas, Scripts, Scenes)
```

---

## 2. Data Contracts (Types)

```ts
// /app/lib/types.ts
export type Engine = 'gpt-4o' | 'gemini-1.5-pro';

export interface GenerationRequest {
  productImageUrl: string;       // signed URL, not base64
  modelImageUrl?: string | null; // signed URL or null
  basicIdea: string;
  engine: Engine;
  visualOverrides?: string | null;
}

export type SceneType = 'Hook' | 'Problem' | 'Solution' | 'CTA';

export interface Scene {
  struktur: SceneType;
  naskah_vo: string;
  visual_idea: string;
  text_to_image?: string; // L5
  image_to_video?: string; // L5
}

export interface Variation {
  id: string;          // var_001..var_100
  theme: string;
  scenes: Scene[];     // 3–4 scenes
}

export interface GenerationResponse { variations: Variation[] }
```

---

## 3. API Surface

### 3.1 Create Generation (enqueue)
`POST /api/generations`

**Request (JSON)**
```json
{
  "productImageUrl": "https://...signed",
  "modelImageUrl": "https://...signed",
  "basicIdea": "Pembersih rambut instan untuk orang sibuk.",
  "engine": "gemini-1.5-pro",
  "visualOverrides": "Di adegan CTA, kemeja kantor putih"
}
```

**Response 200**
```json
{ "generationId": "c0f1...", "status": "queued" }
```

- **Idempotency**: Server computes `idempotency_key = sha256(JSON.stringify(sortedPayload))`. If exists, returns existing `generationId`.

### 3.2 Get Generation (status + progressive results)
`GET /api/generations/:id`

**Response 200**
```json
{
  "id": "c0f1...",
  "status": "running",
  "progress": 35,
  "engine": "gpt-4o",
  "productIdentifier": "ab3...",
  "counts": { "themes": 20, "scripts": 65, "variations": 40 },
  "page": 1,
  "pageSize": 20,
  "variations": [ /* latest page only, optional */ ]
}
```

Pagination params: `?page=1&pageSize=20`.

### 3.3 Cancel Generation
`POST /api/generations/:id/cancel` → marks `status='canceled'`, worker honors cooperative cancel.

---

## 4. Database Schema (Supabase + pgvector)

> All DDL is **idempotent** and safe to re‑run after environment resets.

```sql
create extension if not exists vector;
create extension if not exists pgcrypto; -- for gen_random_uuid

-- Tenancy (optional)
create table if not exists Tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Product & Model snapshots (from L0)
create table if not exists Products (
  id uuid primary key default gen_random_uuid(),
  product_identifier text not null unique,
  description jsonb not null,      -- normalized vision output
  created_at timestamptz default now()
);

create table if not exists Models (
  id uuid primary key default gen_random_uuid(),
  model_identifier text not null unique,
  description jsonb not null,      -- normalized vision or generic text
  source text not null,            -- 'vision' | 'generic'
  created_at timestamptz default now()
);

-- Memory: semantic ideas
create table if not exists Ideas (
  id uuid primary key default gen_random_uuid(),
  product_identifier text not null,
  category_tag text,
  idea_theme text not null,
  idea_vector vector(1536) not null,
  created_at timestamptz default now()
);
create index if not exists ideas_vec_idx
  on Ideas using ivfflat (idea_vector vector_cosine_ops) with (lists = 100);
create index if not exists ideas_prod_idx on Ideas(product_identifier);
create index if not exists ideas_cat_idx on Ideas(category_tag);

-- Generation jobs
create table if not exists Generations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text unique not null,
  tenant_id uuid,
  product_identifier text not null,
  model_identifier text,
  engine text not null check (engine in ('gpt-4o','gemini-1.5-pro')),
  overrides text,
  status text not null default 'queued', -- queued|running|partial|succeeded|failed|canceled
  progress int not null default 0,
  error text,
  created_at timestamptz default now()
);
create index if not exists gens_tenant_idx on Generations(tenant_id);

-- Scripts (100)
create table if not exists Scripts (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references Generations(id) on delete cascade,
  theme text not null,
  idx int not null,      -- 1..100
  structure jsonb not null,
  model_used text not null,
  token_in int default 0,
  token_out int default 0,
  latency_ms int default 0,
  created_at timestamptz default now(),
  unique(generation_id, idx)
);
create index if not exists scripts_gen_idx on Scripts(generation_id);

-- Scenes per script
create table if not exists Scenes (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references Scripts(id) on delete cascade,
  "order" int not null,
  struktur text not null check (struktur in ('Hook','Problem','Solution','CTA')),
  naskah_vo text not null,
  visual_idea text not null,
  text_to_image text,
  image_to_video text,
  created_at timestamptz default now(),
  unique(script_id, "order")
);
create index if not exists scenes_script_idx on Scenes(script_id);
```

### 4.1 RPC for Semantic Match

```sql
create or replace function match_ideas (
  query_vector vector(1536),
  product_id text,
  match_threshold float,
  search_scope text default 'product', -- 'product'|'category'|'global'
  category text default null,
  top_k int default 5
) returns table (
  id uuid,
  product_identifier text,
  idea_theme text,
  score float
) language sql as $$
  select i.id, i.product_identifier, i.idea_theme,
         1 - (i.idea_vector <=> query_vector) as score
  from Ideas i
  where
    (
      (search_scope = 'product' and i.product_identifier = product_id)
      or (search_scope = 'category' and i.category_tag = category)
      or (search_scope = 'global')
    )
    and (1 - (i.idea_vector <=> query_vector)) >= match_threshold
  order by i.idea_vector <=> query_vector asc
  limit top_k;
$$;
```

### 4.2 RLS (multi‑tenant optional)

```sql
-- Example: lock down read access to owner tenant
alter table Generations enable row level security;
create policy gen_tenant_isolation on Generations for select using (
  tenant_id = auth.uid()
);
-- Repeat analogous policies for Scripts, Scenes, Ideas if user-facing.
```

> Use **service role** key only in server/worker. Do not expose to client.

---

## 5. Orchestration Logic (Worker)

**Milestones**
- 10%: Vision done
- 35%: Ideation + Embedding + Filter done (themes=20)
- 75%: Scripting 100 done
- 100%: Visual prompts + persist done

```ts
// /worker/runGeneration.ts (pseudo)
import pLimit from 'p-limit';
import { z } from 'zod';

const limit = pLimit(4); // safe concurrency for provider APIs

export async function runGeneration(genId: string, payload: GenerationRequest) {
  try {
    await updateGen(genId, { status: 'running', progress: 1 });

    // L0: Vision
    const product = await visionDescribe(payload.productImageUrl);
    const productId = stableHash(JSON.stringify(product));

    const model = payload.modelImageUrl
      ? await visionDescribe(payload.modelImageUrl)
      : await genericModelDescribe(payload.basicIdea);
    const modelId = stableHash(JSON.stringify(model));

    await ensureProductModel(productId, product, modelId, model);
    await updateGen(genId, { product_identifier: productId, model_identifier: modelId, progress: 10 });

    // L1: Ideation (50)
    const potentialIdeas = await ideation50(payload.engine, product, payload.basicIdea);

    // L2: Embed + Filter (adaptive)
    const vectors = await embedBatch(potentialIdeas, 20 /*batch*/);
    const themes = await pickUniqueThemes({ vectors, productId, desired: 20 });
    await insertIdeas(productId, themes); // training memory
    await updateGen(genId, { progress: 35 });

    // L3: Script 100 (20×5)
    const scriptBatches = await Promise.all(
      themes.map(t => limit(() => script5(payload.engine, t.text)))
    );
    const scripts100 = scriptBatches.flat();

    const SceneSchema = z.object({
      struktur: z.enum(['Hook','Problem','Solution','CTA']),
      naskah_vo: z.string(),
      visual_idea: z.string(),
      text_to_image: z.string().optional(),
      image_to_video: z.string().optional(),
    }).strict();
    const ScriptSchema = z.object({ id: z.string(), theme: z.string(), scenes: z.array(SceneSchema) }).strict();
    scripts100.forEach(s => ScriptSchema.parse(s));
    await updateGen(genId, { progress: 75 });

    // L5: Visual prompts in chunks of 25
    const final = await visualPromptsInChunks({ product, model, overrides: payload.visualOverrides ?? '', scripts: scripts100, chunkSize: 25 });

    // Persist Scripts + Scenes
    await persistScriptsAndScenes(genId, final);
    await updateGen(genId, { status: 'succeeded', progress: 100 });
  } catch (e) {
    await updateGen(genId, { status: 'failed', error: String(e) });
    throw e;
  }
}
```

**Adaptive Uniqueness**
- Start threshold **0.92**, if themes < 20 reduce to 0.90 → 0.88 … min **0.84**.
- Scope search: `product` → if still less than 20, try `category` → else `global`.
- Intra‑batch dedup: if cosine sim between new ideas > **0.96**, keep one.

---

## 6. Provider Adapters

### 6.1 OpenAI
- **Vision**: GPT‑4o Vision → constrained JSON (`brand`, `form_factor`, `colorway`, `key_benefit`, `category`).
- **Text**: GPT‑4o for generic model description & scripting (when engine=gpt‑4o).
- **Embeddings**: `text-embedding-3-small` (1536 dims) batched.

### 6.2 Gemini 1.5 Pro
- Used for ideation/scripting when engine=`gemini-1.5-pro`.
- Normalized output shape to match Script/Scene schema.

### 6.3 Prompting Conventions
- Always request **strict JSON** with example schema.
- Include **token budget hints** per script (e.g., 250–350 tokens) to fit visual chunking.
- L5 prompt receives `product`/`model` **style sheet** + `overrides` → returns enriched `text_to_image` / `image_to_video` for every scene.

---

## 7. Frontend (Next.js App Router)

**Directory**
```
/app
  /api
    /generations
      route.ts            # POST create job
    /generations/[id]
      route.ts            # GET status/paginated results, POST cancel
  /components
    InputForm.tsx         # upload to Storage, sign URLs
    JobStatus.tsx         # progress bar, counts
    ResultsDisplay.tsx    # paginated list (20/page), export buttons
    StoryboardTable.tsx   # expands a single variation
  /hooks
    useGeneration.ts      # SWR/React Query for polling
  page.tsx                # landing / form
```

**UX Highlights**
- Drag‑drop upload → server transforms to WEBP (max 2048 px) via Edge Function.
- On submit → returns `generationId` → navigate `/generations/:id`.
- Progressive display: show newest 20 first; “Load more”.
- Actions: **Export JSON**, **Copy JSON**, **Re‑roll 5** (subset regeneration with new seed).

---

## 8. Configuration & Environment

```
# OpenAI
OPENAI_API_KEY=...
OPENAI_EMBED_MODEL=text-embedding-3-small

# Google
GEMINI_API_KEY=...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
SUPABASE_STORAGE_BUCKET=ideamill

# Queue (example: Redis/BullMQ)
REDIS_URL=redis://...
QUEUE_CONCURRENCY=4
```

- **Service role** used only server/worker; client uses `anon` + RLS.
- Signed URLs time‑boxed (e.g., 10–30 min) for worker access.

---

## 9. Performance, Cost & Limits (Targets)

- **Calls per 100 variants**: ~25–27 (Vision 1–2, Ideation 1, Script 20, Visual 4).
- **Latency target**: P50 ≤ 2–4 min; P95 ≤ 6–8 min (dependent on provider rate limits).
- **Rate limit**: Max 3 concurrent jobs per user; queue depth alarm > 50.
- **Storage**: Results JSON ≈ 300–600 KB/job; indices scale with ideas.
- **pgvector**: start `lists=100`; increase to 200–400 at >50k rows.

---

## 10. Observability & Governance

- **Logging**: per step (tokens in/out, latency, model, retries, 4xx/5xx codes).
- **Tracing**: OpenTelemetry spans: `L0`, `L1`, `L2-embed`, `L2-filter`, `L3-script`, `L5-visual`, `persist`.
- **Dashboards**: jobs per hour, success rate, avg tokens/script, similarity histograms.
- **Alerts**: error rate > 5% (5m), queue latency > 2m, token spike >2× baseline.
- **PII/Consent**: Avoid storing personal face data; store text descriptors instead. If user uploads human images, obtain consent flag.

---

## 11. Testing Strategy

- **Unit**: adapters (OpenAI/Gemini), vector math, schema validation (zod).
- **Integration**: end‑to‑end with mocked providers; golden JSON snapshots.
- **Load**: simulate 20 concurrent jobs, ensure queue back‑pressure.
- **Chaos**: random provider 429/500 → verify retry/backoff, partial resume.

---

## 12. Security & RLS Patterns

- Client uploads via signed POST; server verifies MIME/type/size.
- RLS example for user isolation (if multi‑tenant):
```sql
alter table Ideas enable row level security;
create policy ideas_tenant_isolation on Ideas for select using (
  exists(select 1 from Tenants t where t.id = auth.uid())
);
```
- Mask secrets in logs; encrypt at rest via Supabase defaults.

---

## 13. Migrations & Seed

- **Migrations**: SQL files `001_init.sql`, `002_rls.sql`, `003_rpc.sql` (idempotent).
- **Seed**: optional base categories (`haircare`, `skincare`, `footwear`) with 2–3 starter ideas per category to warm cache and test IVFFLAT analyze.

```sql
-- Seed sample idea (optional)
insert into Ideas(product_identifier, category_tag, idea_theme, idea_vector)
values (
  'seed-product', 'haircare', 'Morning Rush Refresh',
  -- dummy zero vector for dev only; replace via embed call in real seed script
  array_fill(0.0::float, array[1536])
) on conflict do nothing;
```

---

## 14. Failure Modes & Runbooks

- **Provider 429**: exponential backoff (base 500ms, jitter, max 5 retries). If still failing → mark job `partial` and resume later.
- **Token overflow at L5**: reduce chunk size to 20; trim script verbosity; enforce max tokens per scene.
- **DB contention**: batch inserts (Scripts, Scenes) in transactions of 50–100 rows.
- **Queue outage**: buffer requests in DB table `PendingTasks`; cron sweeper enqueues when queue healthy.

---

## 15. Example Prompts (Summarized)

### L0 Vision (Product)
"Return STRICT JSON with fields: brand, form_factor, colorway, key_benefit, category, notable_text."

### L1 Ideation (50 angles)
"Generate 50 distinct marketing angles covering problem/benefit/lifestyle/UGC/educational/trend for PRODUCT_JSON + BASIC_IDEA. Return array of strings with category labels."

### L3 Scripting (x5 per theme)
"For THEME, produce 5 scripts with scenes [Hook, Problem, Solution, CTA]. Each scene has `naskah_vo` and `visual_idea`. Strict JSON. Limit per script ≤ 320 tokens."

### L5 Visual Prompts (chunked)
"You are a visual prompt assistant. Given MODEL_SHEET, PRODUCT_SHEET, OVERRIDES, enrich each SCENE with `text_to_image` and `image_to_video`. Respect style constants and overrides at CTA. Return JSON only."

---

## 16. CI/CD & Deployment

- **CI**: lint, type‑check, unit tests, contract tests (schemas), migration dry‑run.
- **CD**: Blue‑green deploy for worker + web; feature flags for engine selection.
- **Secrets**: managed via platform vault; rotated quarterly.

---

## 17. Roadmap Extensions

- **Style locking**: fine‑tune per brand guidelines; reusable style sheets.
- **Cross‑product memory**: similarity aware recommendations across categories.
- **A/B explorer**: auto‑rank 100 variations by predicted CTR using a lightweight model.
- **Exporters**: CSV, XLSX, and storyboard PDF.

---

## 18. Acceptance Criteria (Go‑Live)

- Generate 100 variations under 8 minutes P95, error rate < 3%.
- Dedup themes to ≥ 20 unique themes (unless inputs are pathological).
- All outputs pass schema validation; no Personally Identifiable Visuals stored.
- RLS active (if multi‑tenant); service key never reachable from client.

---

## 19. Appendix — Minimal Directory Tree

```
/project-ideamill
├── /app
│   ├── /api
│   │   ├── /generations/route.ts
│   │   └── /generations/[id]/route.ts
│   ├── /components
│   ├── /hooks
│   ├── /lib
│   │   ├── adapters/ (openai.ts, gemini.ts)
│   │   ├── orchestrator.ts
│   │   ├── supabaseClient.ts
│   │   └── types.ts
│   └── page.tsx
├── /worker
│   ├── index.ts
│   └── runGeneration.ts
├── /sql
│   ├── 001_init.sql
│   ├── 002_rls.sql
│   └── 003_rpc.sql
├── .env.local
└── package.json
```

> This spec is production‑oriented, reset‑safe (idempotent SQL), and optimized for your Supabase + Next.js workflow.

