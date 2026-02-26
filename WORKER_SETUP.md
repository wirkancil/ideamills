# 🔄 Simple Worker - Otomatis & Langsung

## ✅ **Status: SEDERHANA & OTOMATIS**

Sistem worker IdeaMill sekarang jauh lebih sederhana dengan **automated polling** yang langsung dan tanpa kompleksitas.

---

## 🚀 **Quick Start**

### **1. Start Worker (REQUIRED untuk auto-processing)**

Buka **terminal baru** dan jalankan:

```bash
cd /Users/mac/Documents/Bharata-AI/ideamills
npm run worker
```

Worker akan:
- ✅ **Poll setiap 3 detik** untuk pending jobs
- ✅ **Auto-process** semua jobs yang masuk
- ✅ **Handle errors** secara otomatis
- ✅ **Update progress** real-time di database
- ✅ **Continue running** sampai Anda stop (Ctrl+C)

---

## 📊 **System Architecture**

```
┌─────────────┐
│   Browser   │  Submit Generation Request
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  API Endpoint    │  Create Generation + Enqueue Job
│ /api/generations │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  JobQueue       │  PostgreSQL Table (pending → processing → completed)
│  (Database)     │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Simple Worker  │  Poll every 3 seconds
│  (Auto-process) │  → Pick up pending jobs
└──────┬──────────┘  → Run L0-L5 generation pipeline
       │              → Update progress (5% → 10% → 35% → 75% → 100%)
       ▼              → Save 100 variations to database
┌─────────────────┐
│   Database       │  Generations, Ideas, Scripts, Scenes tables
│   (Supabase)     │
└─────────────────┘
```

---

## 🔧 **Worker Commands**

### **Start Simple Worker**
```bash
npm run worker
```

### **Manual Process One Job** (for debugging)
```bash
npm run process:job
```

### **Check Job Status**
```bash
npm run check:jobs
```

### **Reset Stuck Jobs**
```bash
npm run reset:jobs
```

---

## 🎯 **How It Works**

### **1. Job Creation**
- User submit form di browser
- API create `Generation` record (status: `queued`)
- API enqueue job ke `JobQueue` (status: `pending`)

### **2. Worker Processing**
- Simple worker poll database setiap 3 detik
- Jika ada pending job:
  - Mark job as `processing`
  - Call `runGeneration()` function
  - Execute L0-L5 pipeline:
    - **L0**: Vision Analysis (5% → 10%)
    - **L1**: Theme Generation (10% → 35%)
    - **L2-L4**: Script Generation (35% → 75%)
    - **L5**: Visual Enrichment (75% → 100%)
  - Save all 100 variations to database
  - Mark job as `completed`

### **3. Frontend Updates**
- Frontend poll `/api/generations/[id]` setiap 2 detik
- Progress bar update real-time
- Status badge update: "Antrian" → "Memproses" → "Selesai"
- Counts update: Tema, Script, Variasi

---

## ⚙️ **Configuration**

Edit `worker/simple-worker.ts` untuk customize:

```typescript
const POLL_INTERVAL = 3000; // Poll every 3 seconds
```

---

## 🐛 **Troubleshooting**

### **Worker Not Processing Jobs**

1. **Check if worker is running:**
   ```bash
   ps aux | grep simple-worker
   ```

2. **Check job queue:**
   ```bash
   npm run check:jobs
   ```

3. **Reset stuck jobs:**
   ```bash
   npm run reset:jobs
   ```

4. **Restart worker:**
   - Stop: Press `Ctrl+C` in worker terminal
   - Start: `npm run worker`

### **Worker Crashes**

Worker akan auto-retry pada next poll cycle. Check logs untuk error details.

---

## ✅ **Verification**

### **Test Full System:**

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Start simple worker** (di terminal baru):
   ```bash
   npm run worker
   ```

3. **Submit generation** di browser
   - Progress akan update real-time
   - Status akan berubah: "Antrian" → "Memproses" → "Selesai"

---

## 📝 **Notes**

- ✅ Worker loop **fully automated** - tidak perlu intervensi manual
- ✅ **Error handling** - failed jobs akan marked dan logged
- ✅ **Real-time progress** - frontend auto-update setiap 2 detik
- ✅ **Scalable** - bisa run multiple workers untuk parallel processing

---

## 🎉 **You're All Set!**

System sekarang **fully automated & sederhana**. Cukup:
1. Keep `npm run dev` running
2. Keep `npm run worker` running
3. User bisa submit generations - semua akan auto-processed! 🚀

