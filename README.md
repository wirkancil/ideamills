# IdeaMills

AI-powered platform untuk generate konsep iklan video — dari foto produk + keyword menjadi script, storyboard, visual prompt, dan video.

## Pipeline

```
Foto Produk + Keyword
  → L0 Vision       — analisis produk & model
  → L1 Ideation     — 50 angle marketing
  → L2 Embed+Dedup  — filter → 20 tema unik
  → L3 Scripting    — 20 tema × 5 = 100 script
  → L5 Visual Prompt — text2img + img2vid prompt
  → [manual] Generate Image → Generate Video
```

Flow alternatif (enhanced): User memilih 1 ide kreatif dari UI → langsung generate N storyboard (tanpa ideation/embedding).

## Pages

- `/` — Dashboard utama: input foto + keyword, pilih ide kreatif, monitor job
- `/studio` — Studio mode: buat scene manual + generate VEO prompt
- `/assets` — Assets manager: browse hasil image/video yang sudah di-generate
- `/history` — Riwayat semua generation
- `/generations/[id]` — Detail per generation (scenes, prompt, image, video)

## Tech Stack

- **Next.js 15** (App Router) + React + Tailwind + shadcn/ui
- **MongoDB** — database + GridFS (uploaded images) + job queue + rate limiter state
- **OpenRouter** — single gateway untuk semua LLM calls (GPT, Claude, Gemini, DeepSeek, Cohere, Flux)
- **useapi.net** — Google Flow Veo video generation
- **Worker** — proses async pipeline, polling MongoDB queue

## Quick Start

```bash
npm install
cp .env.example .env.local   # isi OPENROUTER_API_KEY, USEAPI_TOKEN, MONGODB_URI
./start.sh                   # jalankan MongoDB + Next.js dev + worker sekaligus
```

Buka http://localhost:3000

## Docs

- **[docs/setup.md](docs/setup.md)** — instalasi, env vars, utility scripts, troubleshooting
- **[docs/architecture.md](docs/architecture.md)** — struktur folder, LLM middleware, DB schema, worker
- **[docs/tech-spec.md](docs/tech-spec.md)** — spesifikasi pipeline L0-L5, API routes, model config
- **[CHANGELOG.md](CHANGELOG.md)** — riwayat perubahan
