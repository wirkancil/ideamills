# 🔧 Troubleshooting Guide

## ❌ Problem: Job Stuck di L0 (Vision Analysis)

**Symptoms:**
- Progress stuck di 10%
- Product ID tetap "pending"
- Job berjalan >10 menit tanpa progress
- OpenAI Vision API error: "Timeout while downloading"

**Causes & Solutions:**

### 0. **Image File Too Large** ⚠️ **MOST COMMON ISSUE!**

**Symptoms:**
- Error: `400 Timeout while downloading`
- Image size > 2-3 MB
- OpenAI Vision API cannot download image in time

**Solution:** ✅ **FIXED!** 
- Upload endpoint sekarang **auto-compress** images:
  - Max size: 1024x1024 pixels
  - Max file size: ~1MB after compression
  - Automatic JPEG conversion for better compression
- **No action needed** - sistem akan otomatis compress gambar baru

**Test:**
```bash
# Upload new image - check server logs for compression info
# You'll see: "📸 Original image: X MB" → "✅ Compressed: Y MB"
```

### 1. **Supabase Storage Bucket Tidak Public** ⚠️ **MOST COMMON**

**Check:**
- Supabase Dashboard → Storage → Bucket `ideamill`
- Lihat apakah bucket marked sebagai **Public**

**Fix:**
1. Buka Supabase Dashboard
2. Storage → `ideamill` bucket
3. Settings → **Toggle "Public bucket"** ON
4. Save

**Verify:**
- Coba akses URL gambar langsung di browser
- Harus bisa dibuka tanpa error

---

### 2. **Image URL Tidak Accessible dari External**

**Test:**
```bash
# Get image URL from generation payload, then test:
curl -I <IMAGE_URL>
# Should return 200 OK
```

**Fix:**
- Pastikan bucket policy mengizinkan public read
- Atau gunakan signed URLs (expire setelah beberapa jam)

---

### 3. **OpenAI API Key Invalid atau Rate Limited**

**Test:**
```bash
npm run test:connection
```

**Fix:**
- Verify `OPENAI_API_KEY` di `.env.local`
- Check OpenAI dashboard untuk rate limits
- Ensure billing active

---

### 4. **Network/Timeout Issue**

**Check worker logs** untuk:
```
❌ Product vision analysis failed: ...
```

**Fix:**
- Check network connectivity
- Increase timeout di OpenAI client (jika perlu)

---

## 🔍 **Debug Steps**

### Step 1: Check Generation Status
```bash
npx tsx scripts/debug-generation.ts <generation-id>
```

### Step 2: Check Worker Logs
Look for:
- `L0: Vision analysis...`
- `✅ Product analysis complete` OR
- `❌ Product vision analysis failed`

### Step 3: Reset Stuck Job
```bash
npx tsx scripts/reset-stuck-jobs.ts
```

### Step 4: Verify Storage Bucket
- Ensure bucket is **public**
- Test URL accessibility

---

## ✅ **Quick Fix Checklist**

- [ ] Supabase bucket `ideamill` is **PUBLIC**
- [ ] Image URLs accessible (test di browser)
- [ ] OpenAI API key valid (`npm run test:connection`)
- [ ] Worker loop running (`ps aux | grep worker-loop`)
- [ ] Network connectivity OK

---

**Setelah fix, reset job dan worker akan process ulang!**

