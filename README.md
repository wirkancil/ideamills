# IdeaMill - AI Ad Variation Generator

IdeaMill adalah platform berbasis AI yang menghasilkan **100 variasi iklan** siap storyboard dari gambar produk, gambar model (opsional), dan ide dasar. Sistem ini menggunakan GPT-4o atau Gemini 1.5 Pro untuk ideation dan scripting, dengan semantic deduplication menggunakan pgvector.

## 🚀 Fitur Utama

- ✅ **100 Variasi Otomatis**: Generate 100 script iklan unik dalam 2-8 menit
- ✅ **Semantic Deduplication**: Menggunakan pgvector untuk memastikan setiap ide benar-benar unik
- ✅ **Multi-Engine**: Pilih antara GPT-4o (OpenAI) atau Gemini 1.5 Pro (Google)
- ✅ **Visual Prompts**: Setiap scene dilengkapi dengan `text_to_image` dan `image_to_video` prompts
- ✅ **Progress Tracking**: Real-time progress monitoring
- ✅ **Export JSON**: Export hasil dalam format JSON terstruktur

## 🏗️ Tech Stack

- **Frontend**: Next.js 15 (App Router), React 18, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI**: OpenAI GPT-4o, Google Gemini 1.5 Pro
- **Orchestration**: Custom async worker (dapat diintegrasikan dengan BullMQ/Cloud Tasks)

## 📦 Instalasi

### Prerequisites

- Node.js 18+
- Supabase account
- OpenAI API key
- Google Gemini API key (opsional)

### Setup

1. Clone repository:
```bash
git clone <repo-url>
cd ideamills
```

2. Install dependencies:
```bash
npm install
```

3. Setup environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` dan isi dengan kredensial Anda:
```
OPENAI_API_KEY=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_STORAGE_BUCKET=ideamill
```

4. Setup Supabase Database:

Jalankan SQL scripts di Supabase SQL Editor:

```bash
# Di Supabase Dashboard > SQL Editor, jalankan:
# 1. sql/001_init.sql
# 2. sql/002_rls.sql  
# 3. sql/003_rpc.sql
```

5. Setup Supabase Storage:

- Buat bucket bernama `ideamill` di Supabase Storage
- Set bucket sebagai public atau buat signed URLs policy

6. Run development server:
```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

## 📖 Cara Penggunaan

1. **Upload Gambar Produk** (wajib): Upload foto produk yang ingin diiklankan
2. **Upload Gambar Model** (opsional): Upload foto model/talent jika ada
3. **Masukkan Ide Dasar**: Deskripsikan ide campaign Anda
4. **Pilih Engine**: Pilih GPT-4o atau Gemini 1.5 Pro
5. **Visual Override** (opsional): Tambahkan instruksi khusus untuk visual
6. **Generate**: Klik tombol dan tunggu 2-8 menit
7. **Review & Export**: Lihat hasil, expand untuk detail, dan export JSON

## 🏗️ Arsitektur

### Alur Kerja (Worker Pipeline)

```
L0: Vision Analysis
  ↓ (10%)
L1: Ideation (50 angles)
  ↓
L2: Embedding + Filtering (→ 20 unique themes)
  ↓ (35%)
L3: Script Generation (20 × 5 = 100 scripts)
  ↓ (75%)
L5: Visual Prompt Enrichment
  ↓
Persist to Database
  ↓ (100%)
Done ✓
```

### Database Schema

- **Generations**: Job tracking
- **Scripts**: 100 variasi per generation
- **Scenes**: 3-4 scenes per script (Hook, Problem, Solution, CTA)
- **Ideas**: Semantic memory dengan vector embeddings
- **Products/Models**: Vision analysis cache

## 🎨 Komponen UI (shadcn/ui)

- `InputForm`: Form upload dan parameter input
- `JobStatus`: Progress bar dan status tracking
- `ResultsDisplay`: Paginated results dengan expand/collapse
- `Button`, `Card`, `Input`, `Label`, `Progress`, `Select`, `Tabs`, dll.

## 🔧 Konfigurasi

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `GEMINI_API_KEY` | Google Gemini API key | Optional |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side) | Yes |
| `SUPABASE_ANON_KEY` | Anonymous key (client-side) | Yes |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name | Yes |

## 📊 Performance Targets

- **Latency**: P50 ≤ 2-4 menit, P95 ≤ 6-8 menit
- **API Calls**: ~25-27 calls per generation
- **Error Rate**: < 3%
- **Deduplication**: ≥ 20 unique themes

## 🚀 Deployment

### Vercel (Recommended)

```bash
npm run build
vercel deploy
```

### Self-hosted

```bash
npm run build
npm run start
```

### Worker Queue (Production)

Untuk production, integrasikan dengan job queue seperti BullMQ:

```typescript
// worker/index.ts
import { Worker } from 'bullmq';

const worker = new Worker('generation-queue', async (job) => {
  await runGeneration(job.data.generationId, job.data.payload);
});
```

## 📝 API Endpoints

- `POST /api/upload` - Upload image to Supabase Storage
- `POST /api/generations` - Create new generation job
- `GET /api/generations/:id` - Get generation status & results
- `POST /api/generations/:id` - Cancel generation (action=cancel)

## 🧪 Testing

```bash
# Run linter
npm run lint

# Type check
npx tsc --noEmit
```

## 🛠️ Roadmap

- [ ] BullMQ/Redis integration
- [ ] Rate limiting per user
- [ ] Cost tracking dashboard
- [ ] Multi-language support (English, etc.)
- [ ] PDF storyboard export
- [ ] A/B testing recommendations

## 📄 License

ISC

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 📞 Support

Untuk pertanyaan atau bantuan, silakan buka issue di repository ini.

---

Built with ❤️ using Next.js, Supabase, OpenAI, and shadcn/ui

