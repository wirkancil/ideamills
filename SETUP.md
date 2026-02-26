# Setup Guide - IdeaMill

Panduan lengkap untuk setup IdeaMill dari nol hingga production-ready.

## 📋 Prerequisites

- Node.js 18+ dan npm
- Account Supabase (gratis)
- OpenAI API key (dengan billing aktif)
- Google Gemini API key (opsional, gratis tier available)

---

## 🚀 Quick Start (5 menit)

### 1. Clone & Install

```bash
cd ideamills
npm install
```

### 2. Setup Supabase

1. Buka [Supabase Dashboard](https://supabase.com/dashboard)
2. Create new project
3. Tunggu provisioning selesai (~2 menit)

### 3. Setup Database

Di Supabase Dashboard → SQL Editor:

**Step 1:** Copy-paste isi `sql/001_init.sql` → Run
**Step 2:** Copy-paste isi `sql/002_rls.sql` → Run
**Step 3:** Copy-paste isi `sql/003_rpc.sql` → Run

### 4. Setup Storage

Di Supabase Dashboard → Storage:

1. Create new bucket: `ideamill`
2. Set sebagai **Public bucket** (atau setup signed URLs)

### 5. Get API Keys

**Supabase:**
- Dashboard → Settings → API
- Copy `URL`, `anon public key`, `service_role key`

**OpenAI:**
- [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Create new secret key

**Gemini (opsional):**
- [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Create API key

### 6. Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# OpenAI
OPENAI_API_KEY=sk-proj-...your-key...
OPENAI_EMBED_MODEL=text-embedding-3-small

# Google Gemini (optional)
GEMINI_API_KEY=AIza...your-key...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...your-service-key...
SUPABASE_ANON_KEY=eyJhbG...your-anon-key...
SUPABASE_STORAGE_BUCKET=ideamill

# Redis/Queue (optional for dev)
REDIS_URL=redis://localhost:6379
QUEUE_CONCURRENCY=4
```

### 7. Run Development Server

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) 🎉

---

## 🧪 Testing Setup

### Test 1: Upload Image

1. Buka homepage
2. Upload gambar produk (contoh: botol shampo)
3. Jika upload berhasil, akan ada checkmark ✓

### Test 2: Generate (Small Test)

**Untuk testing awal, modify worker untuk generate hanya 10 variasi:**

Edit `worker/runGeneration.ts`, line ~95:
```typescript
// Change from:
const uniqueThemes = await pickUniqueThemes({ vectors: themesWithVectors, productId, desired: 20 });

// To:
const uniqueThemes = await pickUniqueThemes({ vectors: themesWithVectors, productId, desired: 2 });
```

Dan line ~119:
```typescript
// Change from 100 to 10
if (scripts100.length > 10) {
  scripts100 = scripts100.slice(0, 10);
}
```

Submit form dengan:
- Gambar produk
- Ide: "Pembersih rambut untuk orang sibuk"
- Engine: GPT-4o

Tunggu ~1-2 menit untuk 10 variasi test.

---

## 🔧 Troubleshooting

### Error: "Upload failed"

**Solusi:**
- Pastikan bucket `ideamill` sudah dibuat
- Pastikan bucket public atau RLS policy correct
- Check Supabase Storage logs

### Error: "Failed to create generation"

**Solusi:**
- Pastikan SQL migrations sudah dijalankan semua (001, 002, 003)
- Check Supabase logs di Dashboard → Logs → Postgres Logs
- Verify `SUPABASE_SERVICE_ROLE_KEY` correct

### Error: OpenAI API calls failing

**Solusi:**
- Verify `OPENAI_API_KEY` valid
- Check billing di OpenAI dashboard
- Pastikan rate limits tidak exceeded

### Progress stuck di 10%

**Solusi:**
- Check browser console untuk errors
- Check server logs (terminal running `npm run dev`)
- Verify semua env variables set correctly

---

## 🚀 Production Deployment

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Set environment variables di Vercel Dashboard
# → Settings → Environment Variables
```

### Option 2: Docker

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Build dan run:
```bash
docker build -t ideamill .
docker run -p 3000:3000 --env-file .env.local ideamill
```

### Production Checklist

- [ ] All env variables set di production
- [ ] Supabase production instance (not free tier if high volume)
- [ ] Rate limiting implemented
- [ ] Error tracking setup (Sentry, etc.)
- [ ] BullMQ/Redis for job queue (instead of in-process worker)
- [ ] Monitoring dashboard (Grafana, Datadog, etc.)
- [ ] Backup strategy untuk database

---

## 🎯 Performance Optimization

### Database Indexing

Jika sudah ada >50k ideas, update ivfflat lists:

```sql
-- Di Supabase SQL Editor
DROP INDEX ideas_vec_idx;
CREATE INDEX ideas_vec_idx 
  ON Ideas USING ivfflat (idea_vector vector_cosine_ops) 
  WITH (lists = 400);
```

### Caching

Tambahkan Redis caching untuk:
- Product/Model descriptions (L0)
- Embedding results (L2)

```typescript
// Example with Redis
const cached = await redis.get(`product:${productId}`);
if (cached) return JSON.parse(cached);
```

### Rate Limiting

Tambahkan rate limiter di API routes:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
});
```

---

## 📊 Monitoring

### Key Metrics to Track

1. **Generation success rate**: Should be >97%
2. **Average latency**: P50 < 4 min, P95 < 8 min
3. **Cost per generation**: Track OpenAI API costs
4. **Uniqueness score**: Average similarity of selected themes

### Logs to Monitor

- API request/response times
- Worker execution times per step (L0-L5)
- OpenAI API errors (429, 500, etc.)
- Database connection errors

---

## 🆘 Support

Jika ada masalah:

1. Check logs di Supabase Dashboard
2. Check browser console
3. Check server terminal logs
4. Open issue di GitHub

---

Happy generating! 🎨✨

