# Technical Specification
## AI Video Generation Pipeline
### Dashboard Internal Tim — RnD Phase
**April 2026 | v1.0 | Confidential**

---

## 1. Overview

Platform ini mengotomasi proses dari foto produk dan keyword hingga menghasilkan video siap pakai, melalui pipeline AI berlapis yang terdiri dari vision analysis, ideation, scripting, visual generation, dan video generation.

**Tujuan Platform:**
- Mengotomasi produksi konten video produk dari input minimal (foto + keyword)
- Mengurangi waktu produksi konten dari hari menjadi menit
- Menghasilkan variasi script dan visual yang beragam secara otomatis
- Menyimpan seluruh aset (gambar + video) secara lokal dengan metadata terstruktur

| Komponen | Teknologi | Fungsi Utama |
|---|---|---|
| Dashboard | Next.js (local) | UI utama, review, trigger pipeline |
| LLM Gateway | OpenRouter | Vision, ideation, embed, scripting, prompt enrichment |
| Image Generation | Gemini 2.0 Flash (OpenRouter) | text2img dari visual prompt |
| Video Generation | Google Flow Veo (useapi.net) | img2vid dari gambar hasil generate |
| Captcha Solver | CapSolver (useapi.net) | Otomasi reCAPTCHA Google Flow |
| Database | MongoDB (local) | Simpan metadata, script, prompt, path file |
| File Storage | Local filesystem | Simpan file gambar dan video |

---

## 2. Tech Stack

### 2.1 Frontend & Backend

| Layer | Tech | Versi | Keterangan |
|---|---|---|---|
| Framework | Next.js | 14+ | App router, server actions, API routes |
| Runtime | Node.js | 20+ | Server-side pipeline execution |
| Database client | Mongoose | 8+ | ODM untuk MongoDB |
| HTTP client | Axios / fetch | Native | Call ke OpenRouter & useapi.net |
| File system | Node.js fs | Native | Read/write file lokal |

### 2.2 External API

| Service | Base URL | Auth | Fungsi |
|---|---|---|---|
| OpenRouter | https://openrouter.ai/api/v1 | Bearer API key | Semua kebutuhan LLM + image gen |
| useapi.net | https://api.useapi.net/v1 | Bearer API token | Google Flow video + CapSolver |
| MongoDB | mongodb://localhost:27017 | Local connection | Database lokal |

### 2.3 Model per Layer

| Layer | Model ID | Provider | Alasan |
|---|---|---|---|
| L0 Vision | `openai/gpt-4o` | OpenAI via OpenRouter | Terbaik untuk analisa visual produk |
| L1 Ideation | `deepseek/deepseek-chat-v3-5` | DeepSeek via OpenRouter | Murah, cepat, kreatif untuk ideasi |
| L2 Embed | `openai/text-embedding-3-small` | OpenAI via OpenRouter | Embedding untuk cosine similarity dedup |
| L3 Scripting | `deepseek/deepseek-chat-v3-5` | DeepSeek via OpenRouter | Volume tinggi, kualitas script baik |
| L5 Visual Prompt | `deepseek/deepseek-chat-v3-5` | DeepSeek via OpenRouter | Enrichment prompt text2img + img2vid |
| text2img | `google/gemini-2.0-flash-exp:free` | Google via OpenRouter | Generate gambar dari prompt |
| img2vid | `veo-3.1-fast` | Google Flow via useapi.net | Generate video $0.05/video |

---

## 3. Pipeline Specification

Pipeline terdiri dari 7 layer berurutan (L0–L5 + generate). Setiap layer menerima output layer sebelumnya sebagai input. Progress disimpan ke MongoDB di setiap checkpoint.

```
Input: Foto produk + keyword
        ↓
L0: GPT-4o Vision — analisa foto produk (10%)
        ↓
L1: DeepSeek V3.2 — generate 50 angle
        ↓
L2: text-embedding-3-small — dedup → 20 tema unik (35%)
        ↓
L3: DeepSeek V3.2 — 20×5 = 100 script (75%)
        ↓
L4: Review Manual — user approve/edit/reject (80%)
        ↓
L5: DeepSeek V3.2 — enrichment visual prompt
        ↓
Gemini 2.0 Flash — generate gambar (text2img)
        ↓
Google Flow Veo — generate video (img2vid)
        ↓
Download & simpan local + persist MongoDB (100%)
        ↓
Notifikasi + tampil di dashboard
```

---

### 3.1 L0 — Vision Analysis (10%)

| Aspek | Detail |
|---|---|
| Input | File foto produk (JPEG/PNG) + keyword dari user |
| Model | `openai/gpt-4o` via OpenRouter |
| Output | JSON: `{ warna, style, target_audience, usp, kategori_produk, tone }` |
| Max tokens | 500 output tokens |
| Timeout | 30 detik |

**System Prompt:**
```
You are a product analyst. Analyze the product image and extract:
- color_palette: main colors (array of hex)
- style: visual style (minimalist/bold/luxury/casual/etc)
- target_audience: demographic description
- usp: unique selling points (array, max 3)
- product_category: type of product
- tone: brand tone (formal/playful/premium/etc)
Return ONLY valid JSON, no explanation.
```

---

### 3.2 L1 — Ideation (generate 50 angle)

| Aspek | Detail |
|---|---|
| Input | Output JSON dari L0 |
| Model | `deepseek/deepseek-chat-v3-5` via OpenRouter |
| Output | Array 50 string, masing-masing adalah angle/ide konten video |
| Max tokens | 2000 output tokens |
| Timeout | 60 detik |

**System Prompt:**
```
You are a creative content strategist for social media video.
Based on this product analysis: {L0_output}
Generate exactly 50 unique video content angles.
Each angle is 1 sentence describing the video concept.
Vary across: lifestyle, benefit, emotion, comparison, tutorial, storytelling.
Return ONLY a JSON array of 50 strings.
```

---

### 3.3 L2 — Embed & Filter (35%)

| Aspek | Detail |
|---|---|
| Input | Array 50 angle dari L1 |
| Model | `openai/text-embedding-3-small` via OpenRouter |
| Proses | Embed semua angle → hitung cosine similarity → cluster → pilih representatif |
| Threshold duplikasi | Similarity > 0.85 dianggap duplikat, ambil 1 representatif per cluster |
| Output | Array 20 tema unik (default), user bisa adjust threshold di dashboard |
| User control | Slider threshold (0.70–0.95) + manual add/remove tema di dashboard |

**Algoritma Dedup:**
```
1. Embed semua 50 angle menggunakan text-embedding-3-small
2. Hitung cosine similarity matrix (50x50)
3. Greedy clustering: mulai dari angle pertama sebagai cluster seed
4. Angle dengan similarity > threshold ke seed manapun = duplikat, skip
5. Angle yang tidak duplikat = cluster seed baru
6. Ambil max 20 cluster seeds sebagai tema unik
7. Simpan similarity score per tema ke MongoDB untuk referensi
```

---

### 3.4 L3 — Scripting (75%)

| Aspek | Detail |
|---|---|
| Input | 20 tema unik dari L2 + output L0 |
| Model | `deepseek/deepseek-chat-v3-5` via OpenRouter |
| Proses | Per tema: generate 5 script variasi secara paralel (Promise.all) |
| Output | 100 script total (20 tema × 5 variasi) |
| Max tokens per script | 300 tokens |
| Struktur script | `{ hook, body, cta, duration_sec, tone, visual_cue }` |
| Timeout per batch | 120 detik (20 tema diproses paralel) |

**System Prompt:**
```
You are a video script writer for short-form social media (15-60 sec).
Product context: {L0_output}
Content angle: {tema}
Write 5 unique script variations. Each must have:
- hook: opening line (max 10 words, attention-grabbing)
- body: main content (2-3 sentences)
- cta: call to action (max 8 words)
- duration_sec: estimated duration (15/30/45/60)
- tone: script tone
- visual_cue: brief description of visuals to show
Return ONLY valid JSON array of 5 script objects.
```

---

### 3.5 L4 — Review (Manual)

| Aspek | Detail |
|---|---|
| Trigger | Otomatis setelah L3 selesai — dashboard menampilkan 100 script |
| UI | Card per script dengan preview hook, body, CTA, durasi |
| Aksi user | Approve, Reject, atau Edit + Generate Ulang (per script, satu per satu) |
| Edit + Generate Ulang | User edit field manapun → klik regenerate → DeepSeek generate ulang 1 script baru |
| Batch action | Select all approved → lanjut ke L5 |
| Status simpan | Setiap aksi (approve/reject/edit) langsung update MongoDB |
| Minimum lolos | Tidak ada minimum — user bebas lanjutkan berapa saja script yang lolos |

> **Catatan:** Semua script yang di-approve di L4 akan langsung di-generate visual (gambar + video). Script yang di-reject tetap tersimpan di MongoDB dengan status `rejected` (tidak dihapus).

---

### 3.6 L5 — Visual Prompt Enrichment

| Aspek | Detail |
|---|---|
| Input | Script yang lolos L4 + output L0 |
| Model | `deepseek/deepseek-chat-v3-5` via OpenRouter |
| Output per script | `{ img_prompt: string, vid_prompt: string, n_images: number }` |
| n_images | Dikonfigurasi user di dashboard (default: 1, max: 4) |
| img_prompt | Prompt detail untuk Gemini text2img (lighting, angle, mood, subject) |
| vid_prompt | Prompt motion untuk Google Flow img2vid (camera movement, action) |
| Timeout | 60 detik |

**System Prompt:**
```
You are a visual director for AI-generated product videos.
Script: {script}
Product context: {L0_output}
Generate:
1. img_prompt: detailed text-to-image prompt for Gemini.
   Include: subject, lighting, camera angle, background, mood, style.
   Max 200 words. Be specific and cinematic.
2. vid_prompt: motion prompt for video generation.
   Include: camera movement (pan/zoom/dolly), subject action, atmosphere.
   Max 100 words.
Return ONLY valid JSON: { img_prompt, vid_prompt }
```

---

### 3.7 Generate Gambar (text2img)

| Aspek | Detail |
|---|---|
| Input | `img_prompt` dari L5 per script |
| Model | `google/gemini-2.0-flash-exp:free` via OpenRouter |
| Endpoint | `POST https://openrouter.ai/api/v1/chat/completions` |
| n_images | Sesuai setting user di dashboard (1–4) |
| Output | URL gambar dari OpenRouter response |
| Post-process | Download gambar ke local → simpan ke `/storage/images/{jobId}/` |
| Proses | Paralel per script (Promise.all dengan concurrency limit 5) |
| Timeout | 60 detik per gambar |

---

### 3.8 Generate Video (img2vid)

| Aspek | Detail |
|---|---|
| Input | Path gambar lokal + `vid_prompt` dari L5 |
| Endpoint | `POST https://api.useapi.net/v1/google-flow/videos` |
| Upload gambar | `POST /assets/{email}` → dapat `mediaGenerationId` |
| Model video | `veo-3.1-fast` ($0.05/video) |
| Aspect ratio | Dikonfigurasi user di dashboard (landscape/portrait) |
| Mode | `async: true` → polling `GET /jobs/{jobId}` setiap 10 detik |
| Timeout polling | 10 menit maksimal |
| Output | URL video dari Google Flow (valid ~24 jam) |
| Post-process | Download video ke `/storage/videos/{jobId}/` sebelum URL expired |
| Captcha | CapSolver handle otomatis via useapi.net |

---

### 3.9 Simpan ke MongoDB & Storage

| Aspek | Detail |
|---|---|
| Gambar path | `/storage/images/{jobId}/{scriptId}_{index}.jpg` |
| Video path | `/storage/videos/{jobId}/{scriptId}.mp4` |
| MongoDB update | Update document job dengan path file, status 100%, timestamp selesai |
| Dashboard update | Polling status dari MongoDB setiap 5 detik, tampil otomatis saat done |

---

## 4. MongoDB Schema

### 4.1 Collection: `jobs`

```json
{
  "_id": "ObjectId",
  "jobId": "String",
  "status": "pending | running | review | generating | done | failed",
  "progress": "Number (0-100)",
  "createdAt": "Date",
  "updatedAt": "Date",
  "input": {
    "keyword": "String",
    "imagePath": "String",
    "imageUrl": "String"
  },
  "config": {
    "embedThreshold": "Number (default: 0.85)",
    "nImages": "Number",
    "aspectRatio": "landscape | portrait",
    "videoModel": "String (default: veo-3.1-fast)"
  },
  "l0": {},
  "l1": { "angles": ["String"] },
  "l2": { "themes": ["String"] },
  "scripts": ["ScriptDocument ref"],
  "summary": {
    "totalScripts": "Number",
    "approvedScripts": "Number",
    "totalImages": "Number",
    "totalVideos": "Number",
    "completedAt": "Date"
  }
}
```

### 4.2 Collection: `scripts`

```json
{
  "_id": "ObjectId",
  "scriptId": "String ({jobId}_t{themeIndex}_s{scriptIndex})",
  "jobId": "String",
  "themeIndex": "Number (0-19)",
  "scriptIndex": "Number (0-4)",
  "theme": "String",
  "status": "pending | approved | rejected | generating | done",
  "content": {
    "hook": "String",
    "body": "String",
    "cta": "String",
    "duration_sec": "Number",
    "tone": "String",
    "visual_cue": "String"
  },
  "editHistory": [
    {
      "editedAt": "Date",
      "previousContent": {}
    }
  ],
  "visualPrompts": {
    "img_prompt": "String",
    "vid_prompt": "String"
  },
  "assets": {
    "images": [
      {
        "index": "Number",
        "localPath": "String",
        "generatedAt": "Date"
      }
    ],
    "video": {
      "localPath": "String",
      "jobIdUseapi": "String",
      "generatedAt": "Date"
    }
  },
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

---

## 5. API Routes (Next.js)

| Method | Route | Fungsi | Request Body |
|---|---|---|---|
| POST | `/api/jobs/create` | Buat job baru, trigger L0 | `{ keyword, imageBase64, config }` |
| GET | `/api/jobs/:jobId` | Get status & data job | - |
| GET | `/api/jobs/:jobId/scripts` | Get semua script job | `?status=approved` |
| POST | `/api/jobs/:jobId/run-l1` | Trigger L1 ideation | - |
| POST | `/api/jobs/:jobId/run-l2` | Trigger L2 embed & filter | `{ threshold? }` |
| POST | `/api/jobs/:jobId/run-l3` | Trigger L3 scripting | - |
| PATCH | `/api/scripts/:scriptId` | Update status/content script | `{ status?, content? }` |
| POST | `/api/scripts/:scriptId/regenerate` | Regenerate 1 script | `{ content }` |
| POST | `/api/jobs/:jobId/run-l5` | Trigger L5 + generate semua | - |
| GET | `/api/scripts/:scriptId/assets` | Get path file aset | - |
| GET | `/storage/:type/:jobId/:file` | Serve file lokal (gambar/video) | - |

---

## 6. Struktur Folder

```
project/
├── app/                        # Next.js app router
│   ├── api/                    # API routes
│   │   ├── jobs/
│   │   └── scripts/
│   └── dashboard/              # UI pages
├── lib/
│   ├── pipeline/               # Logic per layer
│   │   ├── l0-vision.js
│   │   ├── l1-ideation.js
│   │   ├── l2-embed.js
│   │   ├── l3-scripting.js
│   │   ├── l5-visual-prompt.js
│   │   ├── generate-image.js
│   │   └── generate-video.js
│   ├── db/                     # MongoDB models
│   │   ├── job.model.js
│   │   └── script.model.js
│   └── openrouter.js           # OpenRouter client
├── storage/                    # File lokal (gitignore)
│   ├── images/
│   │   └── {jobId}/
│   │       └── {scriptId}_{index}.jpg
│   └── videos/
│       └── {jobId}/
│           └── {scriptId}.mp4
├── .env.local                  # API keys
└── .env.example
```

---

## 7. Environment Variables

```env
# OpenRouter
OPENROUTER_API_KEY=sk-or-...

# useapi.net
USEAPI_TOKEN=user:xxxxx-...
USEAPI_GOOGLE_EMAIL=your@gmail.com

# MongoDB
MONGODB_URI=mongodb://localhost:27017/ai-pipeline

# App
STORAGE_PATH=./storage
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 8. Error Handling & Retry

| Skenario | Handling | Retry |
|---|---|---|
| OpenRouter timeout | Catch error, log ke MongoDB, status layer = failed | Manual re-trigger dari dashboard |
| Gemini image gen gagal | Skip gambar tersebut, lanjut ke script berikutnya | Otomatis 2x retry, lalu flag failed |
| useapi.net 429 | Wait 10 detik, retry | Otomatis 3x retry dengan exponential backoff |
| useapi.net 503 | Wait 15 detik, retry | Otomatis 3x retry |
| Video URL expired sebelum download | Tidak bisa recover — generate ulang diperlukan | Manual re-trigger dari dashboard |
| MongoDB connection error | App crash dengan error message jelas | Restart app |
| L2 embed < 20 tema | Lanjut dengan jumlah tema yang ada (tidak error) | Tidak perlu retry |

---

## 9. Rate Limits & Concurrency

| Service | Limit | Handling di App |
|---|---|---|
| OpenRouter | 200 req/menit (paid) | Concurrency limit 5 request paralel di L3 |
| Gemini image gen | Tidak didokumentasikan | Concurrency limit 3 paralel, retry on 429 |
| Google Flow (useapi.net) | 1 video per akun (praktik: 5+) | Async mode, polling setiap 10 detik |
| MongoDB local | Tidak ada limit | Connection pooling default Mongoose |

---

## 10. Progress Tracking

| Progress | Checkpoint | Status |
|---|---|---|
| 0% | Job dibuat, menunggu | `pending` |
| 10% | L0 Vision selesai | `running` |
| 25% | L1 Ideation selesai | `running` |
| 35% | L2 Embed & Filter selesai | `running` |
| 75% | L3 Scripting selesai | `review` |
| 80% | L4 Review selesai (user approve) | `generating` |
| 80–99% | L5 + Generate gambar + video berjalan | `generating` |
| 100% | Semua aset tersimpan di local | `done` |

---

## 11. Referensi

- OpenRouter API docs: https://openrouter.ai/docs
- OpenRouter models: https://openrouter.ai/models
- useapi.net Google Flow API: https://useapi.net/docs/api-google-flow-v1
- useapi.net POST /videos: https://useapi.net/docs/api-google-flow-v1/post-google-flow-videos
- useapi.net POST /assets: https://useapi.net/docs/api-google-flow-v1/post-google-flow-assets-email
- CapSolver: https://capsolver.com
- Next.js docs: https://nextjs.org/docs
- Mongoose docs: https://mongoosejs.com/docs
