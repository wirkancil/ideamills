# 📋 IdeaMill - Migration Guide

Panduan step-by-step untuk run SQL migrations di Supabase.

## ⚠️ PENTING: Urutan HARUS Benar

Jalankan migrations **SATU PER SATU** dengan urutan ini:
1. ✅ 001_init.sql (WAJIB PERTAMA)
2. ✅ 002_rls.sql
3. ✅ 003_rpc.sql
4. ✅ 004_queue_table.sql

## 🎯 Cara Run Migration di Supabase

### Step 1: Buka SQL Editor

1. Buka browser ke: https://supabase.com/dashboard/project/rqdyygzsdyyxqgunmdhi/sql
2. Pastikan Anda sudah login
3. Klik tombol **"+ New query"** (tombol + di kanan atas)

### Step 2: Run Migration 001 (TERPENTING!)

1. **Buka file** `sql/001_init.sql` di VS Code atau editor Anda
2. **Select ALL** (Cmd+A atau Ctrl+A)
3. **Copy** (Cmd+C atau Ctrl+C)
4. **Kembali ke Supabase SQL Editor**
5. **Paste** semua code (Cmd+V atau Ctrl+V)
6. **Klik tombol "Run"** (atau Cmd+Enter)
7. **TUNGGU** sampai selesai (biasanya 2-5 detik)
8. **Check output** di bawah - harus muncul "Success. No rows returned"

⚠️ **Jika ada error:**
- Baca pesan error dengan teliti
- Mungkin perlu enable extensions dulu
- Screenshot error dan share ke saya

### Step 3: Verify Migration 001 Berhasil

Setelah run migration 001, **test apakah table berhasil dibuat**:

Run query ini di SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Expected output (harus ada):**
- Generations
- Ideas
- Models
- Products
- Scenes
- Scripts
- Tenants

Jika **TIDAK ADA table-table ini**, berarti migration 001 **GAGAL**!

### Step 4: Run Migration 002

Setelah migration 001 **BERHASIL**:

1. Klik **"+ New query"** lagi
2. Open file `sql/002_rls.sql`
3. Copy semua → Paste → Run
4. Check: "Success. No rows returned"

### Step 5: Run Migration 003

1. Klik **"+ New query"**
2. Open file `sql/003_rpc.sql`
3. Copy semua → Paste → Run
4. Check: "Success. No rows returned"

### Step 6: Run Migration 004

1. Klik **"+ New query"**
2. Open file `sql/004_queue_table.sql`
3. Copy semua → Paste → Run
4. Check: "Success. No rows returned"

### Step 7: Final Verification

Setelah SEMUA migrations di-run, verify dengan query ini:

```sql
-- Check all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Check functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
ORDER BY routine_name;
```

**Expected:**
- Tables: Generations, Ideas, JobQueue, Models, Products, Scenes, Scripts, Tenants
- Extension: vector
- Functions: cleanup_old_jobs, complete_job, dequeue_job, fail_job, get_generation_with_variations, match_ideas

## ✅ Test dari Terminal

Setelah semua migrations berhasil:

```bash
npm run test:connection
```

**Expected output:**
```
✅ Supabase connected!
✅ OpenAI connected!
⚠️ Gemini (optional)
✅ Storage accessible!
```

## 🆘 Troubleshooting

### Error: "permission denied to create extension vector"

**Solusi:**
```sql
-- Run ini SEBELUM migration 001
create extension if not exists vector;
```

Atau gunakan Supabase Dashboard → Database → Extensions → Enable "vector"

### Error: "table already exists"

**Aman!** Berarti migration sudah pernah di-run. Lanjut ke migration berikutnya.

### Error: "syntax error"

- Check apakah copy-paste complete (tidak terpotong)
- Check tidak ada karakter aneh di file SQL
- Try copy ulang dari file asli

### Table tidak muncul setelah run migration

1. **Refresh page** Supabase Dashboard
2. Check di: **Database** → **Tables** (sidebar kiri)
3. Jika masih tidak ada, migration **GAGAL** - check error message!

## 💡 Tips

- ✅ Save query dengan nama jelas (e.g., "IdeaMill - Migration 001")
- ✅ Run satu-satu, jangan sekaligus
- ✅ Verify setiap step sebelum lanjut
- ✅ Jika bingung, screenshot dan tanya!

---

**Ready?** Mulai dari Migration 001! 🚀

