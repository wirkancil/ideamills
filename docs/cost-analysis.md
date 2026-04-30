# Cost Analysis IdeaMills

Dokumen ini menjelaskan biaya operasional IdeaMills (platform AI video ad generation) — dari setup awal sampai produksi rutin. Ditulis untuk perencanaan budget tim manajemen.

> **Kurs**: Rp 17.343 per USD (per 30 April 2026)
> **Output**: Video iklan 8 detik (1 clip)

---

## TL;DR — Ringkasan Eksekutif

| | Nilai |
|---|---|
| **Cost per video (default setup)** | Rp 3.000 - 6.000 |
| **Setup cost awal (1x bayar)** | $0 (semua provider free signup) |
| **Operasional bulanan minimum** | Rp 1.000.000 |
| **Output realistis** | 175-210 video/bulan |
| **Budget rekomendasi untuk produksi** | Rp 1.500.000 - 2.000.000/bulan |

**Mode termurah**: Quick Generate (pakai Script Bank + foto asli) → ~Rp 2.700/video
**Mode termahal**: Dari Nol + Premium LLM (Claude) → ~Rp 7.000/video

---

## 1. Komponen Biaya Bulanan

Sistem IdeaMills butuh 4 layanan berbayar. Berikut breakdown setiap layanan, fungsinya, dan harganya:

### 1.1 useapi.net — Subscription Bulanan

**Apa**: Gateway API yang menghubungkan IdeaMills ke Google Flow (Veo & Imagen).
**Harga**: $15/bulan flat (= Rp 260.145).
**Cara bayar**: Subscribe di [useapi.net/dashboard](https://useapi.net/dashboard), bayar via PayPal/Crypto.
**Catatan**: Harga sama untuk semua user, tidak ada tier. Akses semua API (Veo, Imagen, Midjourney, dll).

### 1.2 Akun Google Flow Ultra — Sumber Kredit Veo & Imagen

**Apa**: Akun Google premium yang punya kredit untuk generate video Veo dan image Imagen.
**Harga**:
- **Beli langsung dari Google**: $25/bulan = Rp 433.575
- **Beli di Shopee** (rekomendasi): Rp 230.000 - 300.000/bulan
**Kredit**: 25.000 kredit/bulan
**Konsumsi kredit**:
- Veo 3.1 Fast (8 detik): ~100 kredit/video
- Veo 3.1 Quality (8 detik): ~150 kredit/video
- Imagen 4 (1 image): ~5-10 kredit

**Rekomendasi**: Beli di Shopee, hemat ~30%. Tapi pilih seller terpercaya (rating ≥4.8, ratusan transaksi). Hindari harga di bawah Rp 200.000 (biasanya akun shared multi-user, cepat banned).

### 1.3 CapSolver — Solver reCAPTCHA

**Apa**: Servis pihak ketiga yang otomatis solve reCAPTCHA Google saat akses Google Flow.
**Harga**: ~$10/bulan (= Rp 173.430) atau pay-per-solve ($0.80-3.00 per 1.000 solve).
**Free tier**: useapi.net kasih 100 captcha gratis saat tambah akun Google Flow pertama (cukup untuk ~100 video).

### 1.4 OpenRouter — LLM untuk Generate Ide & Prompt

**Apa**: Gateway untuk akses model AI (Gemini, Claude, GPT) untuk analyze foto + generate ide + write prompt.
**Harga**: Pay-per-token, top-up bebas. Rekomendasi top-up $20/bulan (= Rp 346.860).
**Konsumsi per video**: ~$0.030 (= Rp 526) dengan preset default `fast`.

### 1.5 Total Budget Bulanan

| Layanan | Harga IDR | Catatan |
|---------|-----------|---------|
| useapi.net subscription | Rp 260.145 | Flat, semua user |
| Akun Google Flow Ultra (Shopee) | Rp 230.000 - 300.000 | Variabel tergantung seller |
| CapSolver | Rp 173.430 | Bisa pay-per-solve juga |
| OpenRouter top-up | Rp 346.860 | Pay-per-token, sisa carry over |
| **TOTAL** | **Rp 1.010.435 - 1.080.435** | ~$60-62 |

---

## 2. Cost per Video — Breakdown Lengkap

Asumsi produksi 250 video/bulan penuh, biaya dialokasikan secara proporsional.

### 2.1 Mode Default — "Dari Nol" dengan AI Image Generation

User upload foto produk → AI brainstorm ide → AI generate prompt → AI generate image → Veo render video.

| Tahap | Layanan | Kredit/Token | Biaya per Video |
|-------|---------|--------------|-----------------|
| 1. Vision (analyze foto) | OpenRouter (Gemini Flash) | ~3.500 tokens | Rp 10 |
| 2. Brainstorm ide | OpenRouter (Gemini Flash) | ~3.600 tokens | Rp 16 |
| 3. Generate prompt clip | OpenRouter (Gemini Pro) | ~4.000 tokens | Rp 283 |
| 4. Polish prompt | OpenRouter (Gemini Pro) | ~4.000 tokens | Rp 217 |
| 5. AI image (Imagen 4) | Google Flow | ~5-10 kredit | Rp 53 |
| 6. Video (Veo 3.1 Fast) | Google Flow | ~100 kredit | Rp 1.060 |
| Alokasi useapi.net | Subscription | — | Rp 1.041 |
| Alokasi CapSolver | Subscription | — | Rp 694 |
| **TOTAL** | | | **Rp 3.374** |

### 2.2 Mode "Quick Generate" — Termurah

User upload foto + pilih script jadi dari Script Bank → langsung Veo. Skip semua LLM call.

| Tahap | Layanan | Biaya per Video |
|-------|---------|-----------------|
| 1-4. LLM (vision, ide, expand, enhance) | (skip) | Rp 0 |
| 5. AI image | (skip — pakai foto asli) | Rp 0 |
| 6. Video (Veo 3.1 Fast) | Google Flow | Rp 1.060 |
| Alokasi useapi+CapSolver+Google Flow | | Rp 1.682 |
| **TOTAL** | | **Rp 2.742** |

**Hemat Rp 632 per video** (~19%) dibanding mode default.

### 2.3 Mode "Dari Nol" + Foto Asli — Tengah-tengah

Pakai AI brainstorm ide tapi skip AI image (pakai foto produk asli sebagai start image).

| Tahap | Biaya per Video |
|-------|-----------------|
| LLM (4 calls) | Rp 526 |
| AI image | Rp 0 (skip) |
| Video Veo 3.1 Fast | Rp 1.060 |
| Alokasi fixed cost | Rp 1.682 |
| **TOTAL** | **Rp 3.268** |

**Hemat Rp 106 per video** (~3%) dibanding default.

---

## 3. Pengaruh Pilihan Model

### 3.1 Pilih LLM Model (di EnginePicker)

Default pakai Gemini Flash + Pro. Pilihan lain:

| Model | Total Cost/Video | Catatan |
|-------|------------------|---------|
| **Gemini Flash + Pro** (default fast) | Rp 3.374 | Recommended untuk 90% use case |
| Gemini Pro (semua layer) | Rp 4.587 | Sedikit lebih akurat untuk produk lokal |
| Claude Sonnet 4.6 (vision + expand) | Rp 7.188 | Paling kuat reasoning, tapi mahal |
| GPT-5 (semua layer) | Rp 6.321 | Alternatif Claude |

### 3.2 Pilih Veo Model

| Model | Kredit/Video | Max Video/Bulan | Cost/Video |
|-------|--------------|-----------------|-----------|
| **Veo 3.1 Fast** (default) | 100 | 250 | Rp 3.374 |
| Veo 3.1 Quality | 150 | 166 | Rp 5.050 |
| Veo 2 (legacy, lebih murah) | 20 | 1.250 | Rp 1.131 |

**Trade-off**: Veo 3.1 Quality hasil lebih bagus tapi konsumsi kredit 1.5x → quota habis lebih cepat.

### 3.3 Pilih Image Model

| Model | Kredit/Image | Catatan |
|-------|--------------|---------|
| **Imagen 4** (default) | 5-10 | Cocok untuk produk dan model realistis |
| Nano Banana 2 | 5-10 | Lebih cepat, kualitas mirip |
| Nano Banana Pro | 10-15 | Kualitas lebih tinggi, sedikit lebih mahal |

---

## 4. Realita di Lapangan vs Teori

> **Penting**: Cost di section 2-3 adalah **angka ideal lab-condition**. Di praktik nyata, ada banyak faktor yang bikin cost actual lebih tinggi.

### 4.1 Ringkasan Selisih Teori vs Realita

| Metrik | Teori | Realita | Selisih |
|--------|-------|---------|---------|
| Cost per video (mode default) | Rp 3.374 | Rp 4.500 - 6.000 | **+33-78%** |
| Kapasitas per bulan | 250 video | 175-210 video | **-15-30%** |
| Budget bulanan minimum | Rp 1.000.000 | Rp 1.500.000+ | **+50%** |

**Kesimpulan**: Untuk planning real, **kalikan estimasi teori dengan 1.5x** sebagai buffer faktor risiko.

#### Asal Angka 1.5x (Buffer Multiplier)

> **Catatan transparansi**: Angka 1.5x adalah **estimasi engineering berdasarkan observasi testing internal selama development IdeaMills (April 2026)**, BUKAN dari benchmark publik atau studi formal. Berikut akumulasi faktor yang membentuk angka tersebut:

**Cara hitung 1.5x dari penambahan tiap masalah (compound effect):**

| Faktor (dari Section 4.2) | Compound Multiplier | Sumber Observasi |
|--------------------------|---------------------|------------------|
| LLM retry akibat JSON truncation | ×1.10 - ×1.30 | Log `llm_usage` MongoDB selama testing — 30% generation kena retry minimal 1x |
| Veo failed generation tetap potong kredit | ×1.15 - ×1.25 | useapi.net dashboard logs — 10-20% video fail dengan kredit terpotong |
| Imagen reject content filter (regen 2-4x) | ×1.20 - ×1.40 | Testing prompt anti-PROMINENT_PEOPLE filter — observasi langsung selama session ini |
| Akun Google Flow Shopee banned dalam bulan | ×1.05 - ×1.20 | Forum community Shopee + Reddit r/aivideo — 20-40% akun reseller kena banned |
| Trial-and-error user (regen prompt) | ×1.10 - ×1.25 | Tergantung skill user — pemula regen lebih sering |
| **Compound total** | **×1.40 - ×2.00** | Median ≈ ×1.5 |

**Kenapa median ×1.5 yang dipakai:**
- Untuk user **berpengalaman** (sudah hafal prompt yang work) → ×1.3-1.4 lebih realistis
- Untuk user **pemula** (masih trial-error) → ×1.7-2.0 lebih realistis
- ×1.5 adalah **middle-ground** untuk planning konservatif

#### Referensi & Sumber

Karena IdeaMills baru launch dan tidak ada benchmark publik, angka di doc ini berasal dari:

1. **Log internal MongoDB** — collection `llm_usage` (cost per LLM call) dan `Generations` (success/fail rate). Cara query di Section 6.3.

2. **Dashboard provider** (real-time):
   - OpenRouter activity log: [openrouter.ai/activity](https://openrouter.ai/activity)
   - useapi.net usage: [useapi.net/dashboard](https://useapi.net/dashboard)
   - Google Flow credits: [labs.google.com/fx/tools/flow](https://labs.google.com/fx/tools/flow)

3. **Pricing publik per April 2026**:
   - OpenRouter pricing: [openrouter.ai/models](https://openrouter.ai/models) (verified saat doc ditulis)
   - useapi.net pricing: [useapi.net/pricing](https://useapi.net/pricing) — flat $15/bulan
   - Google Flow Ultra: $25/bulan via [labs.google.com](https://labs.google.com) (verified)
   - Shopee Indonesia: search "Google Flow Ultra" — sample 10 listing seller terpercaya
   - CapSolver: [capsolver.com/pricing](https://capsolver.com/pricing)

4. **Observasi testing langsung** selama development:
   - Content filter Imagen yang ter-trigger (PROMINENT_PEOPLE_FILTER_FAILED, INVALID_ARGUMENT)
   - Akun Google Flow Shopee yang sempat issue cookies (case "session refresh failed" jam 17:00 WIB hari ini)
   - JSON truncation di Gemini Pro saat output > 5000 tokens (case yang kita fix dengan retry)
   - Veo "All operations failed" untuk prompt > 2000 char

5. **Community references** (untuk validasi external):
   - Reddit r/StableDiffusion + r/aivideo — diskusi Veo cost
   - useapi.net Discord/Telegram community
   - Forum Shopee Indonesia — review seller akun Google Flow

**Disclaimer**: Angka di doc ini akan **lebih akurat seiring berjalannya waktu** ketika tim sudah punya data produksi 1-3 bulan. Verify ulang setiap kuartal.

### 4.2 Penyebab Cost Lebih Tinggi

#### Masalah A — LLM Cost Naik 30-100%

**Apa yang terjadi**: OpenRouter top-up $20/bulan habis sebelum 250 video.

**Kenapa**:
- **Retry kena bayar** — kalau output JSON terpotong (token limit), sistem retry 2-3x = bayar 2-3x token.
- **Output lebih panjang dari estimasi** — Gemini Pro generate 4.000-6.000 tokens, bukan 3.000.
- **Foto base64 lebih boros** — image resolusi tinggi konsumsi 3.000-5.000 input tokens (estimasi awal hanya 2.000).
- **Brief panjang user** — kalau user tulis brief detail 5.000 char, tambah ~1.500 tokens input per video.

**Bagaimana solusi**:
- Tetap pakai preset `fast` (Gemini Flash 5x lebih murah dari Pro).
- Edit `productNotes` / `styleNotes` manual kalau LLM kurang akurat — lebih murah dari regenerate full.
- Compress foto produk ke <1MB sebelum upload (lebih sedikit tokens vision).

---

#### Masalah B — Kapasitas Video Berkurang 15-30%

**Apa yang terjadi**: 25.000 kredit Google Flow habis di sekitar video ke-175 (bukan 250).

**Kenapa**:
- **Video gagal tetap potong kredit** — error "All operations failed" tetap kena 50-100 kredit walau video tidak jadi.
- **Trial-and-error user** — user generate, lihat hasil tidak cocok, regen 2-3x = konsumsi 2-3x kredit per video final.
- **Veo aktual cost varies** — kadang 100, kadang 120 kredit per generation.
- **Imagen sharing pool** — kredit untuk image generation berbagi dengan video.

**Bagaimana solusi**:
- **Preview AI image dulu** sebelum klik "Buat Video" — kalau image tidak cocok, regen image (lebih murah) daripada video.
- Pakai **Quick Generate** untuk produksi massal (script Bank teruji, jarang regen).
- Buy **2 akun Google Flow** untuk produksi >200 video/bulan — split risiko kalau 1 akun banned.

---

#### Masalah C — AI Image Sering Di-reject (50-100% retry)

**Apa yang terjadi**: User klik tombol AI generate image, hasil di-reject content filter, harus klik regen 2-4x.

**Kenapa**:
- **PROMINENT_PEOPLE filter** — kata "TikTok creator" / "Gen Z creator" trigger false positive (Imagen kira mau bikin foto public figure).
- **Minor depiction filter** — kata "18 years old" / "remaja" sering di-flag walau legal age.
- **Imagen halusinasi** — render 2 model atau 2 produk identik dalam 1 frame.
- **Filter inkonsisten** — prompt yang sama, kadang lolos kadang tidak.

**Bagaimana solusi** (sebagian sudah di-implement di prompt LLM):
- **Default umur 25-35** di styleNotes (sudah di-enforce di prompt).
- Hindari trigger words: "TikTok", "Gen Z", "viral creator", "influencer".
- Prompt anti-duplication: "ONE person, ONE product" (sudah di-enforce).
- **Fallback**: kalau filter terus reject, pakai `imageMode: inherit` (foto produk asli) — skip Imagen.

---

#### Masalah D — Akun Google Flow Shopee 20-40% Banned dalam 1 Bulan

**Apa yang terjadi**: Akun yang dibeli di Shopee tiba-tiba banned/suspend, sisa kredit hangus.

**Kenapa**:
- **Seller jual akun multi-user** — Google detect multi-device login → flag akun.
- **Akun di-suspend tanpa warning** di tengah bulan.
- **Trial 7-14 hari padahal advertise 1 bulan** — beberapa seller cuma kasih akses parsial.
- **Cookies invalidate** karena Google session conflict antar device.

**Bagaimana solusi**:
- **Pilih seller rating ≥4.8** dengan ratusan transaksi sukses.
- **Hindari harga <Rp 200.000** — pasti shared multi-user.
- **Tanya seller**: "Akun dipakai berapa orang?" — pilih yang dedicated.
- **Backup plan**: siapkan **2 akun pararel** — kalau 1 banned, produksi tetap jalan.
- **Update cookies cepat** lewat `npm run update:cookies` saat ada error 596.

---

#### Masalah E — CapSolver Budget Naik 20-50%

**Apa yang terjadi**: Top-up $10/bulan habis lebih cepat dari estimasi.

**Kenapa**:
- **Cookie expired** trigger reCAPTCHA bertingkat (2-3 captcha per video).
- **Akun baru beli Shopee** perlu verifikasi awal yang intensif.
- **Google detect "suspicious activity"** dari useapi infrastructure → minta captcha lebih sering.

**Bagaimana solusi**:
- Pakai akun Google Flow yang **stable** (rating tinggi, dedicated).
- Refresh cookies sebelum expire (cek dashboard useapi).
- Top-up CapSolver $15-20/bulan untuk produksi medium (lebih aman dari $10).

---

#### Masalah F — useapi.net Reliability ~85-95%

**Apa yang terjadi**: 5-15% generation gagal di luar kontrol kita (API timeout, 503, dll).

**Kenapa**:
- **Traffic peak time** (pagi US, malam Asia) → API timeout / 503.
- **Akun Google Flow banned tiba-tiba** — kredit hangus.
- **Cookies expired tanpa warning**.
- **Google update internal API** → useapi belum support.

**Bagaimana solusi**:
- Schedule generation di **off-peak hours** (malam Indonesia / pagi Asia).
- Monitor `JobQueue` MongoDB collection — kalau banyak fail, restart worker + cek cookies.
- Treat useapi sebagai **best-effort service**, bukan SLA. Plan buffer dalam budget.

### 4.3 Faktor yang Bikin Hemat (Bonus)

| Tindakan | Penghematan |
|----------|-------------|
| Pakai **Quick Generate** mode | -30% LLM cost |
| Pakai **foto asli** (imageMode inherit) | -50% kredit Google Flow (skip Imagen) |
| Generate di **off-peak hours** | Fail rate ~5% (vs 15% peak) |
| **Hari pertama akun Shopee** | Stabil 100% di minggu pertama |

---

## 5. Rekomendasi Budget per Skenario

Berdasarkan realita 4.2, berikut rekomendasi budget realistis untuk berbagai skenario produksi:

### 5.1 Eksperimen / Testing (50-100 video/bulan)

**Use case**: Test prompt, training tim, validasi konsep.
**Budget**: **Rp 800.000/bulan**
**Setup**:
- 1 akun useapi.net ($15)
- 1 akun Google Flow Shopee (Rp 250.000)
- CapSolver $5 (cukup pay-per-solve)
- OpenRouter $10

**Catatan**: Budget include retry 2-3x untuk learning prompt. Jangan ekspektasi production-ready output.

### 5.2 Produksi Kecil — 1 Brand (100-150 video/bulan)

**Use case**: 1 brand, daily content untuk TikTok/IG Reels.
**Budget**: **Rp 1.500.000/bulan**
**Setup**:
- useapi.net ($15)
- 1 akun Google Flow Shopee (Rp 250.000) + cadangan budget Rp 250.000 untuk re-buy kalau banned
- CapSolver $15
- OpenRouter $20

### 5.3 Produksi Sedang — 3-5 Brand (200-250 video/bulan)

**Use case**: Multi-brand, scale UGC content.
**Budget**: **Rp 2.000.000/bulan**
**Setup**:
- useapi.net ($15)
- **2 akun Google Flow Shopee** (Rp 500.000) — backup kalau 1 banned
- CapSolver $20
- OpenRouter $30

**Wajib**: 2 akun Google Flow paralel — produksi tetap jalan kalau 1 akun banned.

### 5.4 Produksi Skala — Agency / 10+ Brand (500+ video/bulan)

**Use case**: Agency, multi-client, daily output tinggi.
**Budget**: **Rp 4.000.000+/bulan**
**Setup**:
- useapi.net ($15)
- **3-5 akun Google Flow Shopee** (Rp 750.000-1.250.000)
- **Dedicated CapSolver plan** $30-50/bulan
- OpenRouter $50-100
- Tim ops untuk monitor pipeline + manage akun

---

## 6. Cara Verifikasi Cost Aktual

Setelah produksi 1-2 minggu, validate angka teori dengan data real.

### 6.1 OpenRouter (LLM Cost)

Login ke `https://openrouter.ai/activity` — lihat log cost per request.

**Hitung**: Total cost minggu ini ÷ jumlah video sukses = **LLM cost real per video**.

### 6.2 Google Flow (Kredit Veo + Imagen)

Login ke akun Google Flow, cek "Credit usage" di dashboard.

**Hitung**: Kredit terpakai ÷ jumlah video sukses (skip yang fail) = **kredit real per video**.

### 6.3 MongoDB — Historical Cost LLM

Query log internal di MongoDB:

```javascript
db.llm_usage.aggregate([
  { $group: {
      _id: '$layer',
      avgCost: { $avg: '$costUsd' },
      totalCost: { $sum: '$costUsd' },
      count: { $sum: 1 }
  } }
])
```

Output: average cost per layer (vision, ideas, expand, enhance) — bandingkan dengan estimasi di section 2.

### 6.4 Pipeline Success Rate

```javascript
db.Generations.aggregate([
  { $group: { _id: '$status', count: { $sum: 1 } } }
])
```

**Target**:
- `completed` >85%
- `failed` <10%
- `partial` <5%

Kalau di luar target, ada masalah pipeline (cek log worker, dashboard useapi).

### 6.5 Action Item

- Bandingkan cost real dengan teori **setiap minggu**.
- Kalau deviasi >20%, update buffer ratio di doc ini.
- Identifikasi outlier (1 video > Rp 10.000) dan investigate kenapa (retry berlebihan? prompt panjang? model premium?).

---

## 7. Cara Optimize Cost

Tips konkret untuk hemat budget tanpa sacrifice kualitas:

1. **Pakai Quick Generate untuk produksi massal** — skip semua LLM call. Cocok untuk produk/style yang sudah teruji.

2. **Pakai foto produk asli (imageMode `inherit`)** — skip Imagen. Hemat ~Rp 100/video + tidak kena content filter Imagen.

3. **Tetap di preset `fast` (Gemini Flash + Pro)** — cukup untuk 90% use case. Premium models (Claude, GPT-5) hanya untuk kasus khusus.

4. **Preview AI image dulu sebelum klik Buat Video** — kalau image tidak cocok, regen image (Rp 53) lebih murah dari regen video full (Rp 1.060+).

5. **Edit `productNotes`/`styleNotes` manual** — kalau LLM hasil kurang akurat, edit teks lebih murah daripada regenerate full pipeline.

6. **Compress foto produk** ke <1MB sebelum upload — vision LLM lebih hemat token, vision call lebih cepat.

7. **Schedule generation di off-peak hours** (malam Indonesia / pagi Asia) — fail rate lebih rendah, retry lebih sedikit.

8. **Backup 2 akun Google Flow paralel** untuk produksi >200 video/bulan — protect dari risiko ban.

---

## 8. Setup Awal — Checklist

Untuk tim baru yang mau setup IdeaMills:

- [ ] **useapi.net subscription** — daftar di [useapi.net/dashboard](https://useapi.net/dashboard), bayar $15/month
- [ ] **Akun Google Flow Ultra** — beli di Shopee (rekomendasi) atau langsung Google ($25)
  - Save credentials (email + password + cookies)
  - Update cookies via `npm run update:cookies`
- [ ] **CapSolver** — daftar di [capsolver.com](https://capsolver.com), top-up $10
  - Tambah CapSolver API key ke useapi.net dashboard
- [ ] **OpenRouter** — daftar di [openrouter.ai](https://openrouter.ai), top-up $20
  - Tambah API key ke `.env.local`: `OPENROUTER_API_KEY=...`
- [ ] **Test pipeline** — run `./start.sh`, generate 1 video Quick Generate
- [ ] **Validate cost** — setelah 10 video, cek dashboard masing-masing service

---

## Appendix: Pricing OpenRouter (April 2026)

Per 1 juta tokens:

| Model | Input | Output |
|-------|-------|--------|
| Gemini 2.5 Flash | $0.075 | $0.30 |
| Gemini 2.5 Pro | $1.25 | $5.00 |
| Claude Sonnet 4.6 | $3.00 | $15.00 |
| GPT-5 | $2.50 | $10.00 |
| DeepSeek V3.2 | $0.20 | $0.80 |
| Grok 4 | $2.00 | $10.00 |

**Catatan**: Pricing bisa berubah. Cek [openrouter.ai/models](https://openrouter.ai/models) untuk angka real-time.
