# 🗃️ IdeaMill Database Reset Guide

Panduan lengkap untuk melakukan reset database Supabase pada project IdeaMill.

## ⚠️ PERINGATAN PENTING

**Script reset akan MENGHAPUS SEMUA DATA secara permanen!**
Pastikan untuk melakukan backup data penting sebelum menjalankan script apapun.

## 📋 Daftar Script Reset

### 1. `scripts/reset-database.js` - Node.js Script
Script utility untuk reset data via command line.

```bash
# Lihat statistik database saat ini
npm run reset:db:stats
# atau
node scripts/reset-database.js stats

# Reset semua data (tetap mempertahankan schema)
npm run reset:db reset
# atau
node scripts/reset-database.js reset
```

### 2. `scripts/reset-supabase-data.sql` - SQL Script
Script SQL untuk reset data saja (schema tetap ada).

**Cara menjalankan:**
1. Buka Supabase Dashboard → SQL Editor
2. Copy & paste isi file `scripts/reset-supabase-data.sql`
3. Klik "Run"

### 3. `scripts/recreate-supabase-schema.sql` - Complete Reset
Script SQL untuk recreate seluruh schema dari nol.

**Cara menjalankan:**
1. Buka Supabase Dashboard → SQL Editor
2. Copy & paste isi file `scripts/recreate-supabase-schema.sql`
3. Klik "Run"

## 🔄 Cara Reset Database

### Opsi 1: Reset Data Saja (Rekomendasi)
```bash
# Via npm script
npm run reset:db reset

# Via direct command
node scripts/reset-database.js reset
```

### Opsi 2: Via Supabase SQL Editor
1. Login ke [Supabase Dashboard](https://app.supabase.com)
2. Pilih project IdeaMill
3. Pergi ke **SQL Editor**
4. Copy & paste script dari `scripts/reset-supabase-data.sql`
5. Klik **Run**

### Opsi 3: Complete Schema Recreation
**Hanya lakukan ini jika ada masalah dengan schema!**
```sql
-- Jalankan di Supabase SQL Editor
-- Copy dari scripts/recreate-supabase-schema.sql
```

## 📊 Memeriksa Status Database

### Via Command Line
```bash
# Lihat statistik database
npm run reset:db:stats

# Atau cek manual
node scripts/reset-database.js stats
```

### Via Supabase Dashboard
1. Pergi ke **Table Editor**
2. Periksa setiap tabel untuk memastikan data sudah kosong

## 🛑 Menghentikan Worker Processes

Sebelum reset database, pastikan semua worker sudah berhenti:

```bash
# Cek worker yang sedang berjalan
ps aux | grep -E "(worker|tsx.*simple-worker)"

# Hentikan semua worker
pkill -f "simple-worker.ts"
pkill -f "npm run worker"

# Verifikasi worker sudah berhenti
ps aux | grep -E "(worker|tsx.*simple-worker)" | grep -v grep
```

## 🔄 Urutan Reset Lengkap

1. **Stop semua worker processes**
   ```bash
   pkill -f "simple-worker.ts"
   ```

2. **Backup data penting (jika ada)**
   ```bash
   # Export data dari Supabase jika diperlukan
   ```

3. **Reset database**
   ```bash
   npm run reset:db reset
   ```

4. **Verifikasi reset berhasil**
   ```bash
   npm run reset:db:stats
   ```

5. **Restart aplikasi**
   ```bash
   npm run dev
   ```

## 📋 Tabel Yang Direset

Script akan menghapus data dari tabel berikut:
- `Generations` - Data generasi utama
- `JobQueue` - Queue pekerjaan async
- `Scripts` - Data script yang dihasilkan
- `Scenes` - Data scene individual
- `Ideas` - Data ide yang dihasilkan
- `Products` - Data produk tersimpan
- `Models` - Data model tersimpan

## 🔧 Troubleshooting

### Error: "Table doesn't exist"
- Jalankan script recreate schema: `scripts/recreate-supabase-schema.sql`

### Error: "Permission denied"
- Pastikan menggunakan `SUPABASE_SERVICE_ROLE_KEY` bukan `ANON_KEY`

### Worker masih berjalan setelah reset
```bash
# Force kill semua worker
pkill -9 -f "worker"
pkill -9 -f "tsx"
```

### Data masih ada setelah reset
- Cek apakah ada foreign key constraints yang mencegah delete
- Jalankan script recreate schema untuk reset total

## 📞 Support

Jika mengalami masalah dengan reset database:
1. Cek logs aplikasi untuk error messages
2. Verifikasi environment variables sudah benar
3. Pastikan koneksi Supabase stabil
4. Coba jalankan script SQL langsung di Supabase Dashboard

## ✅ Checklist Reset Berhasil

- [ ] Worker processes dihentikan
- [ ] Data penting di-backup
- [ ] Script reset berhasil dijalankan
- [ ] Statistik menunjukkan 0 records
- [ ] Aplikasi bisa start tanpa error
- [ ] Generate ide baru berfungsi normal
