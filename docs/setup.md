# Setup

## Prerequisites

- Node.js 20+
- MongoDB running locally (default `mongodb://127.0.0.1:27017`)

## Install

```bash
npm install
cp .env.example .env.local
```

## Environment Variables

Edit `.env.local`:

```env
# OpenRouter — single gateway untuk semua LLM calls
# Dapatkan di: https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-...

# useapi.net — Google Flow Veo video generation
# Dapatkan di: https://useapi.net/dashboard
USEAPI_TOKEN=user:xxxxx-...
USEAPI_GOOGLE_EMAIL=your@gmail.com

# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/ideamills
MONGODB_BUCKET=images

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
STORAGE_PATH=./storage
```

## Run

```bash
# Next.js dev server saja
npm run dev

# Worker saja (pipeline processor)
npm run worker

# Keduanya sekaligus (+ MongoDB jika pakai start.sh)
./start.sh
```

## Utility Scripts

```bash
npm run validate:env    # cek kelengkapan .env.local
npm run check:db        # verifikasi koneksi MongoDB
npm run check:jobs      # lihat state job queue
npm run reset:jobs      # reset stuck jobs ke pending
npm run clear:queue     # kosongkan job queue
```

## Worker Health Check

```bash
curl http://localhost:3000/api/worker/health
```

Response contoh:
```json
{
  "ok": true,
  "queue": {
    "pending": { "standard": 2, "structured": 1, "total": 3 },
    "processing": { "standard": 1, "structured": 2, "total": 3 },
    "failed": 0
  },
  "workers": { "activeInstances": 1, "workerIds": ["macbook:12345"] },
  "avgCompletionMs": { "standard": 612000, "structured": 95000 }
}
```

## Multi-instance Worker

Worker bisa dijalankan lebih dari satu proses — aman karena menggunakan atomic MongoDB dequeue:

```bash
npm run worker &
npm run worker &
```

Setiap instance punya `WORKER_ID = hostname:pid` — stuck job recovery tidak akan cancel job milik instance lain yang masih hidup.

## Troubleshooting

**MongoDB connection refused**
```bash
mongod --dbpath ./data/db
```
Atau sesuaikan `MONGODB_URI` di `.env.local`.

**OpenRouter 401**
Verifikasi API key di openrouter.ai/keys, cek billing/credits.

**Job stuck di processing**
Worker otomatis recover job stuck setelah 15 menit. Atau manual:
```bash
npm run reset:jobs
```

**Worker tidak start**
Pastikan `.env.local` ada dan `MONGODB_URI` + `OPENROUTER_API_KEY` terisi — worker exit jika keduanya tidak ada.
