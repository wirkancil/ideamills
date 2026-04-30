# Studio Clean Flow — Design Spec

**Date:** 2026-04-29
**Status:** Draft (pending user review)
**Skill:** superpowers:brainstorming
**Related:** [2026-04-29-script-bank-design.md](./2026-04-29-script-bank-design.md)

## Goals

Pipeline IdeaMills "Dari Nol" saat ini terlalu panjang dan fragmented. User harus melewati 5+ step user-facing dan editor split jadi 4 tab terpisah (`Hook | Problem | Solution | CTA`). Editing fragmented, mental load tinggi, dan tidak match dengan realita user yang datang dengan ide ad sebagai 1 paragraf utuh.

Spec ini menyederhanakan flow jadi **3 step user-facing** dengan **single unified text per clip** — konsisten dengan filosofi yang sudah disepakati di Script Bank: "Sudah Matang, Tidak Perlu Parsing".

## Design Principle: "1 Idea = 1 Paragraf, 1 Clip = 1 Prompt"

Tidak ada lagi:
- Split Hook / Problem / Solution / CTA per script
- 50 marketing angles → 5 scripts × 4 scenes nested structure
- L5 visual prompt enrichment yang generate text_to_image + image_to_video terpisah
- Director's script generation
- Tab-based editor

Yang ada:
- Idea = title + 1 paragraf naratif yang sudah include visual context (enhanced)
- Clip = 1 textarea unified prompt (8 detik scope)
- Style Notes global yang prepend ke setiap clip prompt
- 4 clip default (dynamic 2-6), parallel generation, no stitching, no extend

## Non-Goals

Eksplisit ditunda atau dihapus:

- **Multi-scene editor (Hook/Problem/Solution/CTA)** — dihapus
- **AI auto-split per scene** — dihapus
- **L5 visual prompt enrichment** — dihapus (gabung dengan expand step)
- **Director's script** — dihapus
- **L1 Ideation 50 angles + L2 Embedding + L3 Scripting** — dihapus, replaced dengan 3-5 ides paragraf
- **Auto-stitch 4 clip jadi 1 video** — dihapus, no ffmpeg dependency
- **Google Flow extend feature (continuity mode)** — future v2
- **Sequential generation dengan last-frame anchor** — future v2
- **Pure text-to-video** — N/A, Veo 3.1 wajib image+text
- **Cache vision result** — selalu fresh per regenerate idea
- **Audio/voiceover separate generation (TTS)** — future v2
- **Cost tracking display** — future v2
- **Test infrastructure** — manual test plan untuk MVP

## Decisions Summary

| Aspek | Keputusan |
|---|---|
| Approach | Total Replacement (clean slate, no v1/v2 dual format) |
| Flow user-facing | 3 step: Input → Pilih Ide → Edit Clips & Generate |
| Idea format | Title + 1 paragraf naratif (60-200 kata) |
| Jumlah clip default | 4 clip × 8 detik (dynamic, range 2-6) |
| Per clip UI | 1 textarea single unified prompt + foto reference slot |
| Style Notes | 1 textarea global, auto-filled dari vision, prepend ke setiap clip prompt |
| Foto produk utama | Wajib upload |
| Foto model | Opsional |
| Image per clip (Veo wajib image+text) | 3 mode: `inherit` (default, foto produk utama) / `override` (upload foto khusus) / `ai-generate` (Gemini Flash) |
| Continuity strategy | AI narrative coherence di prompt level + Style Notes consistency |
| Video output | 4 clip terpisah, no auto-stitch |
| LLM calls per generation | 3 calls: Vision (multimodal) + Ideation + Expand |
| Vision caching | TIDAK — selalu fresh setiap regenerate idea |
| Image generation | Variabel 0-4 calls per generation, hanya saat `imageMode === 'ai-generate'` |
| Veo calls | 4 parallel (existing concurrency limit) |
| Legacy data | Generations lama tag `format_version: 'legacy'`, drop `Scripts` & `Scenes` collections |

## Architecture

### File Structure

```
ideamills/
├── app/
│   ├── api/studio/
│   │   ├── ideas/route.ts                    # NEW — Vision + Ideation
│   │   ├── expand/route.ts                   # NEW — Idea → 4 clip prompts + style notes
│   │   ├── generate/route.ts                 # NEW — enqueue video generation
│   │   └── regenerate-clip/route.ts          # NEW — re-gen 1 clip
│   ├── api/generations/[id]/route.ts         # MODIFIED — return clips[] format
│   ├── api/analyze-images/                   # DELETED
│   ├── api/generate-creative-ideas/          # DELETED
│   ├── api/generate-enhanced/                # DELETED
│   ├── api/generate-directors-script/        # DELETED
│   ├── lib/
│   │   ├── llm/
│   │   │   ├── prompts.ts                    # MODIFIED — drop IDEATION_USER, SCRIPTING_USER, VISUAL_PROMPT_USER; add IDEAS_USER, EXPAND_USER
│   │   │   ├── index.ts                      # MODIFIED — expose ideateFromImages, expandToClips; drop ideation50, script5, enrichVisualPrompts
│   │   │   └── registry.ts                   # MODIFIED — drop layers embedding/scripting/visualPrompt; add layers ideas/expand
│   │   ├── types.ts                          # MODIFIED — drop SceneType/Scene/Variation; add Clip/Idea
│   │   ├── useapi.ts                         # UNCHANGED
│   │   └── storage.ts                        # UNCHANGED
│   ├── studio/
│   │   ├── page.tsx                          # REWRITE — state machine 3 step
│   │   └── components/
│   │       ├── StudioInput.tsx               # NEW — Step 1
│   │       ├── IdeaPicker.tsx                # NEW — Step 2
│   │       ├── ClipEditor.tsx                # NEW — Step 3
│   │       ├── StyleNotesField.tsx           # NEW — Step 3 header
│   │       └── ImageSlot.tsx                 # NEW — per-clip image source picker
│   ├── generations/[id]/page.tsx             # MODIFIED — render ClipResults, fallback "Legacy generation, hapus?"
│   └── components/
│       ├── ClipResults.tsx                   # NEW — render N clip videos di detail page
│       ├── ResultsDisplay.tsx                # DELETED (656 lines)
│       └── SceneAssetPanel.tsx               # DELETED
├── worker/
│   ├── runGeneration.ts                      # REWRITE — pipeline 3-step
│   └── generateAssets.ts                     # MODIFIED — generate per clip parallel
├── scripts/
│   └── migrate-drop-legacy.ts                # NEW — drop Scripts & Scenes, mark legacy generations
└── docs/
    └── superpowers/specs/
        └── 2026-04-29-studio-clean-flow-design.md  # this file
```

### API Routes

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/studio/ideas` | `{ generationId?, productImageUrl, modelImageUrl?, brief }` | `{ generationId, productAnalysis, modelAnalysis, ideas: [{title, content}] }` |
| POST | `/api/studio/expand` | `{ generationId, selectedIdeaIndex }` | `{ styleNotes, clips: [{prompt}] }` |
| POST | `/api/studio/generate` | `{ generationId, styleNotes, clips: ClipDraft[] }` | `{ jobId }` |
| POST | `/api/studio/regenerate-clip` | `{ generationId, clipIndex, prompt, imageMode, imageDataUrl? }` | `{ assetJobId }` |
| GET | `/api/generations/[id]` | — | `{ ...generation, clips: [...with asset state] }` |

#### `/api/studio/ideas` Detail

```ts
// Body
{
  generationId?: string;        // jika provided = regenerate ide (re-call vision + ideation)
  productImageUrl: string;      // base64 atau URL
  modelImageUrl?: string | null;
  brief: string;                // 0-500 char (boleh kosong)
}

// Pipeline:
// 1. IF generationId existing → update doc; ELSE create new Generations doc
// 2. Vision call (multimodal): foto produk + foto model + brief → productAnalysis + modelAnalysis
// 3. Ideation call (text): productAnalysis + modelAnalysis + brief → 3-5 ides
// 4. Persist ke Generations doc (overwrite kalau regenerate)
// 5. Return JSON

// Vision selalu fresh per call — no cache.
```

#### `/api/studio/expand` Detail

```ts
// Body
{
  generationId: string;
  selectedIdeaIndex: number;
}

// Pipeline:
// 1. Load Generations doc, validate selectedIdeaIndex valid
// 2. Read productAnalysis + modelAnalysis dari doc (sudah ter-store dari Step 1)
// 3. Single LLM call: productAnalysis + modelAnalysis + selectedIdea + brief
//    → { styleNotes: string, clips: Array<{prompt: string}> }
// 4. Persist styleNotes + clips ke doc (clips diisi prompt only, image fields belum)
// 5. Return JSON
```

#### `/api/studio/generate` Detail

```ts
// Body
{
  generationId: string;
  styleNotes: string;           // user mungkin sudah edit
  clips: Array<{
    index: number;
    prompt: string;             // user mungkin sudah edit
    imageMode: 'inherit' | 'override' | 'ai-generate';
    imageDataUrl?: string | null;  // wajib jika imageMode === 'override'
  }>;
}

// Pipeline:
// 1. Validate (Zod schema)
// 2. Update Generations doc dengan styleNotes + clips final
// 3. Enqueue ke JobQueue
// 4. Return jobId; client redirect ke /generations/[id]

// Worker (per clip parallel):
// - Resolve image source per imageMode
// - Build finalPrompt = styleNotes + "\n\n" + clip.prompt
// - createVideoJob({ mediaGenerationId, prompt: finalPrompt, model: 'veo-3.1-fast' })
// - waitForVideo → download → save to /storage/videos/{generationId}/clip-{index}.mp4
// - Update clip.video_status, clip.generated_video_path
```

#### `/api/studio/regenerate-clip` Detail

```ts
// Body: per clip override
// Pipeline: re-execute worker logic untuk 1 clip saja, update doc, return assetJobId
```

### LLM Calls Architecture

```
Step 1 — POST /api/studio/ideas
  ├─ [Call 1] Vision multimodal (gpt-4o atau gemini-2.5-flash)
  │   Input: foto produk + foto model + brief
  │   Output: { productAnalysis, modelAnalysis }
  │   ~500-800 tokens output
  └─ [Call 2] Ideation text-only (deepseek-v3.5 atau claude-haiku)
      Input: productAnalysis + modelAnalysis + brief
      Output: 3-5 ides paragraf
      ~750 tokens output

Step 2→3 — POST /api/studio/expand
  └─ [Call 3] Expand text-only
      Input: productAnalysis + modelAnalysis + selectedIdea + brief
      Output: { styleNotes, clips: [4× single unified prompt] }
      Instruction: design 4 clips dengan narrative flow, masing-masing self-contained 8 detik
      ~1000 tokens output

Step 3 — Worker per clip
  ├─ [Per clip] Image source resolution (variabel)
  │   imageMode === 'inherit'      → uploadImageAsset(productImageUrl)
  │   imageMode === 'override'     → uploadImageAsset(clip.imageDataUrl)
  │   imageMode === 'ai-generate'  → Gemini Flash text2img → uploadImageAsset(image)
  └─ [Per clip] Veo image-to-video
      mediaGenerationId + finalPrompt → video MP4 → save storage
```

### Architectural Decisions

1. **Vision selalu fresh** per regenerate idea. Tidak ada cache invalidation logic — sederhana dan safer. Cost trade-off: 1 extra multimodal call per "Generate Ide Baru" click (~$0.005-0.01).

2. **Vision result tetap di-store di Generations doc** — bukan untuk cache regenerate, tapi untuk dipakai oleh `/api/studio/expand` step yang butuh productAnalysis + modelAnalysis sebagai context.

3. **Tidak ada layer embedding/scripting/visualPrompt**. 3 LLM calls saja per generation lengkap, turun dari 5+ calls di flow lama.

4. **Continuity via prompt instruction**, bukan technical (no extend, no ffmpeg). LLM modern (Claude/Deepseek) handle narrative flow di prompt level dengan baik.

5. **Image per clip 3 mode**, default `inherit` foto produk utama. Veo 3.1 wajib image+text input, jadi setiap clip pasti punya image anchor. User control via tombol per clip.

6. **Clips embedded di Generations doc** — bukan separate collection. 1 generation = 1 doc lengkap. Max 6 clips × ~2KB = jauh dari 16MB MongoDB limit.

7. **Drop legacy collections** (`Scripts`, `Scenes`) sepenuhnya. Generations doc lama tag `format_version: 'legacy'`, di UI muncul "Generation lama, hapus?".

8. **Endpoint namespace `/api/studio/`** (no v2 suffix). Endpoint lama (analyze-images, generate-creative-ideas, generate-enhanced, generate-directors-script) di-DELETE.

### Dependency

Tidak ada dependency baru. Existing infrastructure 100%:
- OpenRouter (LLM gateway via `app/lib/llm/`)
- useapi.net (Veo via `app/lib/useapi.ts`)
- MongoDB (`app/lib/mongoClient.ts`)
- Local filesystem storage (`app/lib/storage.ts`)
- shadcn/ui primitives (Button, Input, Textarea, Card, dll)

## Database Schema

### Collection: `Generations` (single format)

```ts
interface DBGeneration {
  _id: string;
  idempotency_key?: string;

  // Format marker — 'legacy' untuk doc lama (v1 dengan Scripts+Scenes), undefined/'v2' untuk doc baru
  format_version?: 'legacy';

  // Input
  product_image_url: string;
  model_image_url?: string | null;
  brief: string;                       // 0-500 char (replaced basicIdea field)

  // Vision result (di-store untuk dipakai di expand step)
  productAnalysis?: ProductDescription;
  modelAnalysis?: ModelDescription | null;

  // Ideas dari step pilih
  ideas?: Array<{
    title: string;            // 1-120 char
    content: string;          // 20-800 char, 1 paragraf naratif
  }>;
  selectedIdeaIndex?: number;

  // Expanded clips
  styleNotes?: string;        // 0-1500 char
  clips?: Clip[];

  // Display identifiers (dipakai di history list)
  product_identifier: string;
  creative_idea_title?: string;        // dari ideas[selectedIdeaIndex].title

  // Status & progress
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed' | 'canceled';
  progress: number;
  progress_label?: string;
  error_message?: string | null;

  // Model config
  modelConfig?: Record<string, unknown>;

  created_at: Date;
  updated_at: Date;
}

interface Clip {
  index: number;                       // 0-based, 0-5

  // User-editable
  prompt: string;                      // 10-2000 char, single unified prompt 8 detik scope
  imageMode: 'inherit' | 'override' | 'ai-generate';
  imageDataUrl?: string | null;        // wajib jika imageMode === 'override'

  // Generated assets (di-fill oleh worker)
  generated_image_path?: string | null;  // hanya jika imageMode === 'ai-generate'
  generated_video_path?: string | null;

  // Asset state
  image_status: AssetStatus;           // 'pending' | 'queued' | 'generating' | 'done' | 'failed'
  video_status: AssetStatus;
  image_error?: string | null;
  video_error?: string | null;

  // useapi tracking
  media_generation_id?: string | null;  // dari uploadImageAsset
  video_job_id?: string | null;

  created_at: Date;
  updated_at?: Date;
}
```

### Collections yang DIHAPUS

- `Scripts` — drop sepenuhnya
- `Scenes` — drop sepenuhnya

### Indexes (di `mongoClient.ts` `ensureIndexes()`)

```ts
db.collection('Generations').createIndex({ status: 1 });
db.collection('Generations').createIndex({ created_at: -1 });
db.collection('Generations').createIndex({ idempotency_key: 1 }, { unique: true, sparse: true });
db.collection('Generations').createIndex({ format_version: 1 });  // untuk filter legacy
```

### Validation Rules (Zod)

```ts
const IdeaSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().min(20).max(800),
});

const ClipSchema = z.object({
  index: z.number().int().min(0).max(5),
  prompt: z.string().min(10).max(2000),
  imageMode: z.enum(['inherit', 'override', 'ai-generate']),
  imageDataUrl: z.string().nullable().optional(),
}).refine(
  (clip) => clip.imageMode !== 'override' || (clip.imageDataUrl && clip.imageDataUrl.length > 0),
  { message: 'Foto wajib di-upload untuk imageMode override' }
);

const GenerateRequestSchema = z.object({
  generationId: z.string(),
  styleNotes: z.string().max(1500),
  clips: z.array(ClipSchema).min(2).max(6),
});

const IdeasRequestSchema = z.object({
  generationId: z.string().optional(),
  productImageUrl: z.string().min(1),
  modelImageUrl: z.string().nullable().optional(),
  brief: z.string().max(500).optional().default(''),
});
```

## Data Flow

### Flow 1: Initial Generation (Happy Path)

```
USER: Buka /studio
   ↓
USER: Upload foto produk + foto model (optional) + brief
USER: Klik "Generate Ide"
   ↓
POST /api/studio/ideas
   ├─ Create Generations doc (status: queued, format_version: undefined)
   ├─ Vision call (gpt-4o multimodal)
   │   Input: foto + foto + brief
   │   Output: productAnalysis, modelAnalysis
   ├─ Ideation call (deepseek-v3.5)
   │   Input: vision result + brief
   │   Output: 3-5 ides
   ├─ Update doc dengan vision + ideas
   └─ Return { generationId, productAnalysis, modelAnalysis, ideas }
   ↓
USER: Lihat 3-5 ide cards di Step 2
USER: Klik 1 ide (atau "Generate Ide Baru" → re-call /api/studio/ideas)
   ↓
POST /api/studio/expand
   ├─ Load doc, baca productAnalysis + modelAnalysis + ideas[selectedIdeaIndex]
   ├─ Expand call (deepseek-v3.5)
   │   Input: vision + selectedIdea + brief
   │   Output: { styleNotes, clips: [4× prompt] }
   ├─ Update doc dengan selectedIdeaIndex + styleNotes + clips (prompt only, image_status: 'pending')
   └─ Return { styleNotes, clips }
   ↓
USER: Lihat Step 3 dengan Style Notes + 4 clip textarea auto-filled
USER: Edit kalau perlu, set imageMode per clip
USER: Klik "Buat Video"
   ↓
POST /api/studio/generate
   ├─ Validate Zod schema
   ├─ Update doc dengan final styleNotes + clips
   ├─ Enqueue ke JobQueue
   └─ Return { jobId }
   ↓
CLIENT: Redirect ke /generations/[generationId]
   ↓
WORKER: Pick job dari JobQueue
   ├─ Update doc status: 'processing'
   ├─ Per clip parallel (max concurrency dari workerConfig):
   │   ├─ Resolve image source per imageMode
   │   ├─ Upload image → mediaGenerationId
   │   ├─ finalPrompt = styleNotes + "\n\n" + clip.prompt
   │   ├─ Veo createVideoJob → waitForVideo → download
   │   └─ Update clip.video_status = 'done', clip.generated_video_path
   ├─ Setelah semua clip selesai:
   │   ├─ Jika semua 'done' → status: 'completed', progress: 100
   │   └─ Jika ada yang 'failed' → status: 'partial'
   ↓
CLIENT polling /api/generations/[id] (existing pattern):
   ├─ Update UI per clip status
   └─ Tampil video preview saat done
```

### Flow 2: Regenerate Clip (Setelah Edit)

```
USER: Di /generations/[id], klik "Regenerate" pada clip 2
USER: Edit prompt (optional) di modal/inline editor
USER: Konfirmasi
   ↓
POST /api/studio/regenerate-clip
   ├─ Update doc clips[2] dengan prompt baru, imageMode baru
   ├─ Reset clip[2] asset state (status: 'queued', clear paths)
   ├─ Enqueue single-clip job
   └─ Return { assetJobId }
   ↓
WORKER: Execute clip 2 only (1 image gen kalau perlu, 1 Veo call)
   ↓
CLIENT polling: clip 2 status update saat done
```

### Flow 3: Regenerate Idea (Step 2)

```
USER: Di Step 2 lihat ides yang ada, tidak ada yang cocok
USER: Klik "Generate Ide Baru"
   ↓
POST /api/studio/ideas dengan generationId existing
   ├─ Vision call FRESH (no cache, even though foto sama) → overwrite stored vision
   ├─ Ideation call → overwrite stored ideas[]
   └─ Return new ideas
   ↓
USER: Lihat ides baru di Step 2
```

### Flow 4: Legacy Generation Handling

```
USER: Di /history, lihat list generations
   ├─ Generation baru (format_version: undefined) → render normal
   └─ Generation lama (format_version: 'legacy') → render badge "Generation lama"
USER: Klik generation lama
   ↓
GET /api/generations/[id]
   ├─ Detect format_version === 'legacy'
   └─ Return minimal data (no clips, just metadata)
   ↓
CLIENT: Render fallback UI
   ├─ Pesan: "Generation ini dibuat dengan versi lama dan tidak compatible dengan editor baru."
   └─ Tombol [Hapus]
USER: Klik Hapus → konfirmasi → DELETE → redirect ke /history
```

### Edge Cases

| Scenario | Behavior |
|---|---|
| Foto produk corrupt/unreadable | Vision call return error → 400 ke client → "Foto tidak bisa dibaca" |
| Brief kosong | Default flow lanjut, AI generate dengan context dari foto saja |
| Foto model kosong | Vision call hanya analyze produk, modelAnalysis null, ideation tetap jalan |
| Vision LLM timeout | `withRetry` 1× → kalau tetap gagal → 504 ke client + retry button |
| Ideation return < 2 ides | Re-call 1× dengan stronger prompt instruction |
| Expand return < clips count | Re-call 1× |
| Rate limit OpenRouter | `rateLimiter` backoff 3× max |
| Rate limit useapi | Per clip catch, mark failed, lanjut clip lain |
| 1 clip Veo timeout | clip.video_status: 'failed', generation status: 'partial' |
| 4/4 clip fail | Generation status: 'failed' |
| User klik Kembali dari Step 3 → Step 2 | State preserved client-side, no re-fetch |
| User klik "Generate Ide Baru" 3x | Fine — vision selalu fresh, ides overwrite |
| User edit clip 2 prompt → klik "Buat Video" | Update doc dengan prompt baru, generate normal |
| User edit clip 2 setelah generation done | Tombol "Regenerate" → re-gen clip 2 only |
| User upload foto override yang gagal | Toast "Upload gagal", imageMode revert |
| Storage write fail | Retry 2× backoff, mark clip failed kalau still fail |

### Loading States

| Action | Loading UI |
|---|---|
| Upload foto | Skeleton di slot |
| Generate Ide (Step 1 → 2) | Full overlay "Menganalisis foto + brainstorming ide..." (~10-15s) |
| Generate Ide Baru | Inline spinner di Step 2, ides fade-out → fade-in |
| Pilih Ide (Step 2 → 3) | Skeleton di Step 3 layout (~3-5s) |
| Buat Video | Redirect cepat ke detail page (status: queued) |
| Regenerate clip | Spinner overlay di clip card itu saja |
| Polling generation status | Existing pattern (5s interval queued, 3s processing) |

## Components UI

### Component Tree

```
app/studio/page.tsx
  ├── State: { step, generationId, productImage, modelImage, brief, ideas, styleNotes, clips }
  ├── TopBar
  ├── IF step === 'input'    → <StudioInput />
  ├── IF step === 'pick-idea' → <IdeaPicker />
  └── IF step === 'edit-clips' → <ClipEditor />

app/studio/components/StudioInput.tsx
  ├── PhotoUpload (foto produk, wajib)
  ├── PhotoUpload (foto model, optional)
  ├── BriefTextarea
  └── Button "Generate Ide" → POST /api/studio/ideas

app/studio/components/IdeaPicker.tsx
  ├── Banner "Pilih ide iklan dari yang AI generate"
  ├── IdeaCard[] (title + content)
  ├── Button "Generate Ide Baru" → POST /api/studio/ideas (regen)
  └── Button "Kembali" → step: 'input' (state preserved)

app/studio/components/ClipEditor.tsx
  ├── <StyleNotesField /> (textarea besar di header)
  ├── ClipBlock[] (per clip)
  │   ├── Label "Clip N (8 detik)"
  │   ├── Textarea prompt
  │   └── <ImageSlot mode={imageMode} ... />
  ├── Button "+ Tambah Clip" (max 6)
  └── Button "Buat Video" → POST /api/studio/generate

app/studio/components/StyleNotesField.tsx
  └── Textarea (auto-filled, editable, max 1500 char)

app/studio/components/ImageSlot.tsx
  ├── Display: foto preview sesuai imageMode
  ├── Button [↻ Ganti foto] → file picker → set imageMode='override' + imageDataUrl
  └── Button [✨ AI generate] → set imageMode='ai-generate' (clear imageDataUrl)

app/generations/[id]/page.tsx
  ├── State polling existing
  ├── IF generation.format_version === 'legacy' → <LegacyFallback />
  └── ELSE → <ClipResults clips={generation.clips} />

app/components/ClipResults.tsx
  └── ClipCard[] (per clip)
      ├── Video player (HTML5 native, src=generated_video_path)
      ├── Status badge
      ├── Button [⬇ Download]
      └── Button [↻ Regenerate]

app/components/LegacyFallback.tsx
  ├── Pesan "Generation ini dibuat dengan versi lama..."
  └── Button [Hapus] → DELETE
```

### Komponen Existing yang DIHAPUS

| File | Lines | Replacement |
|---|---|---|
| `app/components/ResultsDisplay.tsx` | 656 | `app/components/ClipResults.tsx` (estimasi <200 lines) |
| `app/components/SceneAssetPanel.tsx` | 542 | Folded into ClipResults |
| `app/components/JobStatus.tsx` | 164 | Reused (unchanged) atau folded ke detail page |
| `app/components/InputForm.tsx` | (orphan) | DELETE — sudah dead code, tidak di-import |

### Komponen Existing yang Direuse

- `app/components/TopBar.tsx`
- `app/components/GenerationHistory.tsx` (filter list dengan format_version: 'legacy' badge)
- `app/components/ui/*` shadcn primitives

### Visual Style

Konsisten dengan IdeaMills + Script Bank existing:
- Border radius: `rounded-xl` / `rounded-2xl`
- Border 2px untuk emphasis
- Spacing: `space-y-6` section, `space-y-3` inner
- Color: primary untuk active, muted-foreground untuk meta
- Bahasa: Indonesia konsisten

### Responsive

- Desktop: container max-w-3xl
- Tablet: same with reduced padding
- Mobile: stack vertical, foto upload jadi 1 kolom

## LLM Prompts

### Vision (Multimodal — gpt-4o atau gemini-2.5-flash)

```
SYSTEM: Kamu adalah analis visual untuk advertising. Lihat foto produk dan foto model
        (jika ada), lalu return JSON description yang akurat dan detail.

USER: [foto produk]
      [foto model] (jika ada)

      Brief user: "{brief}"

      Return JSON:
      {
        "productAnalysis": {
          "brand": "...",
          "category": "...",
          "form_factor": "...",
          "color_scheme": "...",
          "key_benefit": "...",
          "target_audience": "...",
          "style": "...",
          "notable_text": "..."
        },
        "modelAnalysis": {
          "age_range": "...",
          "gender": "...",
          "ethnicity": "...",
          "appearance": "...",
          "style": "..."
        } | null
      }

      Jika foto model tidak ada, set modelAnalysis: null dan suggest persona di field
      yang akan digunakan untuk ideation berdasarkan target_audience produk.
```

### Ideation (Text-only — deepseek-v3.5 atau claude-haiku)

```
SYSTEM: Kamu adalah Senior Creative Strategist untuk iklan video Indonesia.
        Generate ide iklan yang viral, relevan, dan match dengan target audience.

USER: PRODUK: {productAnalysis JSON}
      MODEL: {modelAnalysis JSON}
      BRIEF: "{brief}"

      Generate 3-5 ide iklan video 30 detik untuk produk ini. Setiap ide harus:
      - Punya title singkat menarik (max 60 char)
      - Konten 1 paragraf naratif (60-200 kata) yang sudah include:
        - Konteks visual (model, setting, vibe)
        - Storyline ringkas (apa yang terjadi di video)
        - Tone & mood
        - Why it works untuk target audience

      Return JSON: { "ideas": [{ "title": "...", "content": "..." }] }
```

### Expand (Text-only — deepseek-v3.5)

```
SYSTEM: Kamu adalah video director yang men-design 30-second commercial sebagai
        4 clips × 8 detik dengan narrative flow.

USER: PRODUK: {productAnalysis JSON}
      MODEL: {modelAnalysis JSON}
      IDE TERPILIH: { title: "...", content: "..." }
      BRIEF: "{brief}"

      Tugas:
      1. Tulis "Style Notes" — 1 paragraf yang summarize visual identity:
         produk (anchor keywords), model appearance, location/setting, lighting/tone.
         Style notes ini akan di-prepend ke setiap clip prompt untuk konsistensi.

      2. Design 4 clips × 8 detik. Setiap clip:
         - Self-contained: full visual description (no "as before"/"continuing from")
         - Single unified prompt: include camera angle, framing, lighting, model action,
           product placement, mood — semua dalam 1 paragraf
         - Narrative flow: clip 1 (intro/hook) → clip 2 (build/desire) →
           clip 3 (action/solution) → clip 4 (resolution/CTA)
         - Reference produk dan model konsisten dengan Style Notes
         - 80-200 kata per clip

      Return JSON:
      {
        "styleNotes": "...",
        "clips": [
          { "prompt": "..." },
          { "prompt": "..." },
          { "prompt": "..." },
          { "prompt": "..." }
        ]
      }
```

## Worker Implementation

### `worker/runGeneration.ts` (rewrite)

```ts
// High-level pseudocode
async function runGeneration(jobId: string, payload: GeneratePayload) {
  const generation = await getGeneration(payload.generationId);
  await updateStatus(generation, 'processing', 0, 'Memulai generation...');

  // Per clip parallel (concurrency from workerConfig)
  const clipResults = await Promise.allSettled(
    generation.clips.map((clip, idx) =>
      generateClipAsset(generation, clip, idx, payload.styleNotes)
    )
  );

  const successCount = clipResults.filter(r => r.status === 'fulfilled').length;
  const finalStatus =
    successCount === generation.clips.length ? 'completed' :
    successCount > 0 ? 'partial' : 'failed';

  await updateStatus(generation, finalStatus, 100, `${successCount}/${generation.clips.length} clip done`);
}

async function generateClipAsset(generation, clip, idx, styleNotes) {
  // 1. Resolve image
  let mediaGenerationId: string;
  if (clip.imageMode === 'inherit') {
    await markClipImage(generation._id, idx, 'generating');
    mediaGenerationId = await uploadImageAsset(generation.product_image_url);
  } else if (clip.imageMode === 'override') {
    await markClipImage(generation._id, idx, 'generating');
    mediaGenerationId = await uploadImageAsset(clip.imageDataUrl);
  } else {
    // ai-generate
    await markClipImage(generation._id, idx, 'generating');
    const imagePrompt = `${styleNotes}\n\n${clip.prompt}`;
    const imageDataUrl = await llm.generateImage(imagePrompt);
    const imagePath = await saveLocalImage(generation._id, idx, imageDataUrl);
    await markClipImagePath(generation._id, idx, imagePath);
    mediaGenerationId = await uploadImageAsset(imageDataUrl);
  }
  await markClipImage(generation._id, idx, 'done');

  // 2. Veo image-to-video
  await markClipVideo(generation._id, idx, 'queued');
  const finalPrompt = `${styleNotes}\n\n${clip.prompt}`;
  const veoJobId = await createVideoJob({
    imageUrl: mediaGenerationId,
    prompt: finalPrompt,
    model: 'veo-3.1-fast',
  });
  await markClipVideoJobId(generation._id, idx, veoJobId);
  await markClipVideo(generation._id, idx, 'generating');

  const videoUrl = await waitForVideo(veoJobId);
  const videoPath = await saveLocalVideo(generation._id, idx, videoUrl);
  await markClipVideoPath(generation._id, idx, videoPath);
  await markClipVideo(generation._id, idx, 'done');
}
```

### `worker/generateAssets.ts`

Simplification dari existing — drop logic untuk Scripts+Scenes nesting, langsung loop generation.clips.

## Error Handling

### Validation Errors (400)

| Scenario | Status | Message |
|---|---|---|
| productImageUrl kosong | 400 | "Foto produk wajib diupload" |
| Brief > 500 char | 400 | "Brief maksimum 500 karakter" |
| selectedIdeaIndex invalid | 400 | "Ide tidak valid" |
| Clip prompt < 10 char | 400 | "Prompt clip terlalu pendek (min 10 karakter)" |
| Clip prompt > 2000 char | 400 | "Prompt clip terlalu panjang (max 2000 karakter)" |
| Clips count < 2 atau > 6 | 400 | "Minimum 2 clip, maksimum 6 clip" |
| imageMode override tanpa imageDataUrl | 400 | "Foto wajib di-upload untuk override mode" |

### Runtime Errors

| Scenario | Status | Behavior |
|---|---|---|
| Vision LLM timeout | 504 | Retry 1× via withRetry, fail → user retry button |
| Vision returns invalid JSON | 502 | Parse fallback, log, generic error message |
| Ideation < 2 ides | 502 | Re-call 1× with stronger instruction |
| Expand returns wrong shape | 502 | Re-call 1× |
| Rate limit (OpenRouter) | 429 | Backoff retry 3× max |
| useapi upload fail (per clip) | — | Mark clip image_status: 'failed', proceed others |
| Veo timeout > 10 min (per clip) | — | Mark clip video_status: 'failed' |
| Storage write fail | — | Retry 2× backoff, fail → mark clip failed |
| Generation legacy detected | 200 | Return minimal data, client render LegacyFallback |

### Cost Guard

```ts
const MAX_GENERATIONS_PER_DAY = 50;  // tunable di workerConfig

async function checkCostGuard() {
  const today = new Date(); today.setHours(0,0,0,0);
  const count = await db.collection('Generations').countDocuments({
    created_at: { $gte: today },
  });
  if (count >= MAX_GENERATIONS_PER_DAY) {
    throw new Error('Daily limit reached');
  }
}
```

### Frontend UX

| Scenario | Handling |
|---|---|
| Form Step 1 invalid | Disable "Generate Ide" + inline error per field |
| Step 1 → 2 loading | Full overlay dengan label "Menganalisis foto..." |
| Step 2 → 3 loading | Skeleton di Step 3 |
| User klik Buat Video clip prompt invalid | Toast + scroll ke clip yang invalid |
| Network error generic | Toast "Tidak bisa terhubung, cek koneksi" + retry button |
| Generation legacy | Page render LegacyFallback dengan tombol Hapus |

## Migration Strategy

### Step 1 — Backup

```bash
mongodump --uri=$MONGODB_URI --out=backup-$(date +%Y%m%d)
```

### Step 2 — Code Deploy

- Branch: `feature/studio-clean-flow`
- Implement design ini sesuai writing-plans output
- Build pass: `npm run build`
- Manual test plan execution
- Merge ke `main`

### Step 3 — Database Migration

Jalankan **1 kali** setelah deploy:

```ts
// scripts/migrate-drop-legacy.ts
import { getDb } from '../app/lib/mongoClient';

async function migrate() {
  const db = await getDb();

  // Mark generations lama
  const result = await db.collection('Generations').updateMany(
    { clips: { $exists: false } },
    { $set: { format_version: 'legacy' } }
  );
  console.log(`Marked ${result.modifiedCount} generations as legacy`);

  // Drop koleksi lama
  await db.collection('Scripts').drop().catch(() => console.log('Scripts already dropped'));
  await db.collection('Scenes').drop().catch(() => console.log('Scenes already dropped'));
  console.log('Dropped Scripts & Scenes collections');

  // Ensure indexes
  await db.collection('Generations').createIndex({ format_version: 1 });
  console.log('Created format_version index');
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
```

Run: `npx tsx scripts/migrate-drop-legacy.ts`

### Step 4 — Verify

- [ ] Buat 1 generation baru end-to-end → succeed
- [ ] Lihat /history → generation lama muncul dengan badge "legacy"
- [ ] Klik generation legacy → render LegacyFallback (tidak crash)
- [ ] Hapus generation legacy → success, hilang dari list
- [ ] MongoDB Compass: `Scripts` & `Scenes` tidak ada lagi
- [ ] Worker queue: tidak ada job format lama yang stuck

### Env Vars

Tidak ada perubahan. Existing env vars dipakai semua:
- `OPENROUTER_API_KEY`
- `USEAPI_TOKEN`
- `USEAPI_GOOGLE_EMAIL`
- `MONGODB_URI`
- `STORAGE_PATH`

## Manual Test Plan

### Happy Path

- [ ] Buka `/studio`, render Step 1
- [ ] Upload foto produk + foto model + brief "skincare untuk ibu muda"
- [ ] Klik "Generate Ide" → loading 5-15s → Step 2 muncul dengan 3-5 ide cards
- [ ] Setiap ide tampil: title (1 baris) + content (paragraf naratif)
- [ ] Klik 1 ide → loading 3-5s → Step 3 muncul
- [ ] Step 3: Style Notes auto-filled, 4 clip textarea auto-filled
- [ ] Klik "Buat Video" tanpa edit → redirect ke `/generations/[id]`
- [ ] Status awal: queued, progress 0
- [ ] Polling: progress naik bertahap
- [ ] Per clip status: pending → queued → generating → done
- [ ] Selesai dalam <5 menit, status: completed, semua 4 clip done
- [ ] Per clip: video preview HTML5 player, tombol Download → MP4 download

### Edit Flow

- [ ] Step 3: edit prompt clip 2 (tambah "lighting golden hour") → klik Buat Video
- [ ] Generated clip 2 reflect prompt edit (visible di output)
- [ ] Step 3: clip 3 set imageMode = 'override', upload foto custom
- [ ] Clip 3 video pakai foto custom (visible)
- [ ] Step 3: clip 4 set imageMode = 'ai-generate'
- [ ] Worker generate image dulu (image_status: generating → done), lalu Veo (video_status)
- [ ] Generated image tampil di /generations/[id] sebagai thumbnail clip 4
- [ ] Step 3: tombol "+ Tambah Clip" → muncul clip 5 kosong
- [ ] User isi prompt clip 5 → generate → 5 clip total
- [ ] Step 3: hapus clip 5 → minimal 2 clip tersisa
- [ ] Detail page: klik "Regenerate" pada clip 2 → modal edit prompt → konfirmasi
- [ ] Worker re-execute clip 2 only, clip 1/3/4 tetap

### Edge Cases

- [ ] Foto produk corrupt (file random) → error message clear, tidak crash
- [ ] Brief kosong → masih bisa generate (vision-based ideation)
- [ ] Foto model kosong → vision tetap jalan, modelAnalysis null, ideation tetap relevan
- [ ] Klik "Generate Ide Baru" 3x di Step 2 → fresh vision + ideation tiap kali, ides berubah
- [ ] LLM timeout (simulasi dengan slow network) → retry transparent, atau fail dengan retry button
- [ ] Rate limit useapi (kalau hit) → exponential backoff, eventually success
- [ ] Imitate 1 clip Veo fail → status: 'partial', 3 clip done, 1 failed dengan tombol Regenerate
- [ ] Clip prompt 1 char → validation fail, disable Buat Video
- [ ] Clip prompt 2500 char → validation fail
- [ ] User klik "Kembali" dari Step 3 → Step 2 ides masih ada (no re-fetch)
- [ ] User klik "Kembali" dari Step 2 → Step 1 foto + brief masih ada
- [ ] Refresh page di Step 3 → state hilang (acceptable: localStorage save bisa V2)

### Migration Safety

- [ ] Generation lama (sebelum deploy) muncul di `/history` dengan badge "legacy"
- [ ] Klik generation legacy → render LegacyFallback, tidak crash
- [ ] Hapus legacy → konfirmasi → DELETE → redirect ke /history, hilang dari list
- [ ] MongoDB Compass: cek `Scripts` dan `Scenes` collection sudah tidak ada
- [ ] Buat generation baru setelah migrasi → format baru (clips embedded), no Scripts/Scenes doc

### Production Readiness

- [ ] `npm run build` pass tanpa error TypeScript
- [ ] Semua route handler pakai try/catch yang return JSON error
- [ ] Loading state tampil di setiap async operation
- [ ] Bahasa UI konsisten Indonesia
- [ ] Tidak ada console.error spam saat normal operation
- [ ] Cost guard berfungsi (test dengan MAX_GENERATIONS_PER_DAY = 1)
- [ ] Worker recovery: kalau worker crash mid-generation, status di-update ke 'failed'

## Open Questions / Future Iteration

Bukan blocker MVP, tapi bisa jadi v2 berdasarkan feedback user:

1. **Google Flow extend feature** — implementation continuity mode (cascade clip 2 dari last frame clip 1, dst). Trade-off: sequential generation, cascade failure. Implement kalau user request kuat.

2. **Audio/voiceover terpisah** — TTS pisah dari Veo, user pilih voice + bahasa Indonesia. Veo 3.x support audio inline tapi kontrol kurang.

3. **Dynamic brief suggestion** — saat user upload foto produk di Step 1, AI auto-suggest draft brief yang user bisa edit. Dynamic, bukan static templates.

4. **Variant generation per clip** — "Generate 3 versi clip 2 dengan tone berbeda" — user pilih yang paling cocok.

5. **Cost tracking display** — estimasi cost per generation di akhir Step 3 sebelum klik Buat Video.

6. **Test infrastructure** — Vitest untuk unit, Playwright E2E. Investasi setelah feature stabil.

7. **Audit trail (UsageLog)** — log every LLM call + Veo call dengan cost breakdown ke MongoDB collection. Untuk debugging + cost analysis.

8. **localStorage state preservation** — Step 1-3 state survive refresh.

9. **Script Bank integration** — tombol "Pakai dari Script Bank" di Step 3 untuk fill clip prompt dari saved scripts.

10. **Thumbnail per clip** — extract first frame dari Veo result sebagai thumbnail di history list.