# IdeaMills

AI-powered platform untuk generate iklan video pendek — dari foto produk → ide kreatif → prompt → image → video 8 detik siap pakai TikTok/Instagram.

## Tech Stack

- **Next.js 15** (App Router) + React + Tailwind + shadcn/ui
- **MongoDB** — generation history, job queue, rate limiter, usage logs
- **OpenRouter** — gateway LLM (Gemini, Claude, GPT) untuk vision + ideation + prompt
- **useapi.net Google Flow** — image generation (Imagen 4, Nano Banana) + video generation (Veo 3.1)
- **Worker** — async pipeline polling MongoDB queue

## Two Modes

### 1. Dari Nol — AI Brainstorm dari Foto Produk

```
Upload foto produk + brief
  → AI Vision analyze foto → productAnalysis (brand, form, color, label)
  → AI Ideation generate 3-5 ide naratif
  → User pilih 1 ide
  → AI Expand → productNotes + styleNotes + clip prompt
  → User edit (opsional) + klik AI Generate Image (preview)
  → Klik Buat Video → Veo image-to-video 8 detik
```

### 2. Quick Generate — Pakai Script Bank

```
Upload foto produk + pilih script dari Script Bank
  → Klik Buat Video → Veo image-to-video langsung
```

Mode tercepat dan termurah untuk produksi massal dengan template prompt teruji.

## Pages

- `/studio` — Studio: pilih mode (Dari Nol / Quick), upload foto, generate ide & video
- `/assets` — Assets manager: browse semua image & video yang sudah di-generate
- `/history` — Riwayat semua generation dengan status & link detail
- `/generations/[id]` — Detail per generation: clip, video, full prompt expandable
- `/dashboard` — Overview status worker & pending jobs

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
npx tsx scripts/setup-env.ts   # interactive — atau edit .env.local manual

# Wajib: OPENROUTER_API_KEY, USEAPI_TOKEN, USEAPI_GOOGLE_EMAIL, MONGODB_URI

# 3. Validate env
npm run validate:env

# 4. Start everything (MongoDB + dev server + worker)
./start.sh
```

Buka http://localhost:3000/studio

## Cost per Video

| Mode | Cost/video (default) |
|------|----------------------|
| Quick Generate (foto asli + script bank) | ~Rp 2.700 |
| Dari Nol + foto asli | ~Rp 3.300 |
| Dari Nol + AI image | ~Rp 3.400 |

Detail breakdown + budget bulanan: [docs/cost-analysis.md](docs/cost-analysis.md)

## Provider Setup

| Layanan | Cost/bulan | Fungsi |
|---------|-----------|--------|
| useapi.net subscription | $15 | Gateway ke Google Flow (Veo + Imagen) |
| Akun Google Flow Ultra (Shopee) | Rp 230-300rb | 25.000 kredit Veo + Imagen |
| CapSolver | $10 | Solve reCAPTCHA Google Flow |
| OpenRouter top-up | $20 | Pay-per-token LLM |

**Total: ~Rp 1jt/bulan untuk 175-210 video** (realistis dengan buffer faktor risiko).

## Useful Commands

```bash
npm run dev              # Next.js dev server saja
npm run worker           # Worker saja (perlu dev server jalan)
npm run check:db         # Cek koneksi MongoDB + collection state
npm run check:jobs       # Cek state JobQueue + recent generations
npm run reset:jobs       # Reset job yang stuck di processing
npm run clear:queue      # Hapus semua job di queue
npm run update:cookies   # Refresh Google Flow cookies (dari .cookies.txt)
```

## Docs

- [docs/setup.md](docs/setup.md) — instalasi, env vars, troubleshooting
- [docs/architecture.md](docs/architecture.md) — struktur folder, LLM middleware, DB schema
- [docs/tech-spec.md](docs/tech-spec.md) — spesifikasi pipeline, API routes, model config
- [docs/cost-analysis.md](docs/cost-analysis.md) — breakdown cost + budget rekomendasi
- [docs/superpowers/specs/](docs/superpowers/specs/) — design docs per feature
- [docs/superpowers/plans/](docs/superpowers/plans/) — implementation plans

## License

Internal project — Bharata AI.
