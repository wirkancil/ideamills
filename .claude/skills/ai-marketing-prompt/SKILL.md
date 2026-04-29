---
name: ai-marketing-prompt
description: >
  Skill untuk membuat prompt foto dan video AI marketing yang ultra-realistis dalam konteks pemasaran Indonesia.
  Gunakan skill ini setiap kali pengguna meminta: prompt foto AI, prompt video AI, script konten marketing video,
  prompt untuk generate gambar model/talent, prompt untuk Kling/Runway/Midjourney/HeyGen, variasi prompt marketing,
  atau menyebut kata kunci seperti "prompt foto", "prompt video", "AI marketing", "video monolog", "show product",
  "talent AI", "foto realistis AI", "generate model", "Glow Booster", "folding box", atau nama produk yang ingin
  divisualisasikan dengan AI. Juga aktif saat pengguna memberikan brief produk, brief talent, atau meminta batch
  prompt untuk beberapa variasi sekaligus. Skill ini menghasilkan prompt foto + video yang siap dipakai di tools
  AI image/video generation, mengikuti struktur profesional yang sudah teruji untuk konten marketing Indonesia.
---

# AI Marketing Prompt Generator

Skill ini menghasilkan **Prompt Foto** dan **Prompt Video** yang ultra-realistis untuk konten marketing AI.
Output mengikuti struktur yang sudah teruji untuk tools seperti Midjourney, Kling, Runway, dan HeyGen.

---

## Jenis Konten yang Didukung

- **Monolog Edukasi** — Model berbicara menjelaskan manfaat/cara pakai produk
- **Monolog QnA** — Model menjawab pertanyaan umum seputar produk
- **Podcast** — Dua model atau satu model format diskusi
- **Seminar** — Model presentasi formal/profesional
- **Show Product** — Model menampilkan dan mendeskripsikan produk

---

## Alur Kerja

### 1. Ekstrak Brief dari Pengguna

Kumpulkan informasi berikut (tanya jika belum tersedia):

**Informasi Wajib:**
- Jenis konten (Monolog Edukasi / QnA / Podcast / Seminar / Show Product)
- Produk yang dipromosikan (nama, ukuran, kemasan)
- Target audience (usia, gender, segmen)

**Informasi Tambahan (tanya jika relevan):**
- Ada foto referensi? (jika ya, deskripsikan atau minta user upload)
- Tema/mood konten (edukasi, promo, lifestyle, profesional)
- Preferensi talent (usia, hijab/non-hijab, casual/formal)
- Setting lokasi (kantor, outdoor, studio, rumah)

Jika pengguna memberikan contoh prompt sebelumnya → ekstrak polanya dan adaptasi.

### 2. Buat Script Dialog (jika diminta)

Untuk Monolog Edukasi/QnA, buat script singkat 3-5 kalimat yang:
- Dimulai dengan hook/pertanyaan yang relevan dengan audience
- Berisi 1-2 poin edukasi utama
- Diakhiri dengan soft CTA

Lihat `references/script-templates.md` untuk template per jenis konten.

### 3. Generate Prompt Foto

Ikuti struktur ini secara berurutan:

```
[PEMBUKA FOTO]
Gunakan foto referensi yang nantinya diberikan untuk membuat foto ultra-realistis seorang [GENDER] berusia [USIA] dengan mempertahankan bentuk wajah asli, struktur tulang, proporsi mata, hidung, dan bibir sesuai identitas pada referensi sehingga tetap terlihat seperti orang yang sama. Wajah dibuat bersih natural tanpa noda hitam, tanpa bekas jerawat, tanpa kemerahan, namun tetap mempertahankan tekstur kulit manusia yang realistis dengan detail pori-pori halus yang samar, tidak blur, tidak over-smoothing, dan tidak terlihat seperti kulit plastik atau ilustrasi digital.

[DESKRIPSI PAKAIAN & AKSESORI]
[GESTUR & POSISI TUBUH]
[EKSPRESI WAJAH]
[KOMPOSISI KAMERA]
[PRODUK (jika ada)]
[LATAR BELAKANG]
[PENCAHAYAAN]

[PENUTUP KUALITAS]
Seluruh komposisi terlihat tajam dan fokus dengan kualitas sangat realistis seperti hasil jepretan kamera profesional resolusi tinggi, bukan kartun atau render 3D.
```

Lihat `references/prompt-elements.md` untuk bank frasa tiap elemen.

### 4. Generate Prompt Video

Ikuti struktur ini:

```
[PEMBUKA VIDEO]
Ubah foto referensi menjadi video realistis yang sangat nyata dengan fokus penuh pada ekspresi emosi dan bahasa tubuh model saat menyampaikan [JENIS KONTEN].

[GESTUR SAAT BICARA]
[EMOSI & TONE]
[DESKRIPSI SUARA]
[CATATAN KHUSUS (opsional)]

[PENUTUP KUALITAS VIDEO]
Seluruh pencahayaan, warna, dan detail visual tetap dipertahankan sama persis seperti foto asli. Kualitas video harus tajam, stabil, realistis, tanpa flicker, tanpa distorsi, tanpa efek glitch, dan tanpa artefak visual apapun dari awal sampai akhir.
```

### 5. Format Output

Selalu tampilkan dalam format ini:

```
=== SCRIPT (jika diminta) ===
[script dialog]

=== PROMPT FOTO ===
[prompt foto lengkap]

=== PROMPT VIDEO ===
[prompt video lengkap]
```

Jika diminta batch (beberapa variasi), beri label:
`VARIASI 1 — [deskripsi singkat]`, `VARIASI 2 — [deskripsi singkat]`, dst.

---

## Aturan Kualitas Prompt

### Foto
- **Wajah**: Selalu sertakan penekanan realistis (pori-pori, tekstur kulit, bukan plastik/kartun)
- **Pakaian**: Sebutkan tekstur kain dan lipatan alami
- **Produk**: Jika ada produk, ukurannya harus "proporsional dan masuk akal", tidak mendominasi frame
- **Pencahayaan**: Spesifik (arah, suhu warna, kualitas cahaya)
- **Kamera**: Selalu sertakan jarak dan angle kamera

### Video
- **Gestur**: Harus spesifik pada gerakan tangan/kepala, bukan generik
- **Emosi**: Sesuaikan dengan tone script (edukatif ≠ excited promo)
- **Suara**: Sebutkan usia, karakter suara, tempo bicara
- **Konsistensi**: Tekankan bahwa visual foto harus dipertahankan

### Anti-pattern (hindari)
- Prompt terlalu pendek — kurang dari 150 kata biasanya tidak detail
- Deskripsi kulit tanpa penekanan "bukan kartun/render"
- Produk terlalu besar atau mendominasi frame
- Emosi video tidak sesuai tone script
- Lupa menyebut kualitas akhir video (tanpa flicker, glitch, artefak)

---

## Batch Generation

Jika diminta beberapa variasi:

1. **Variasi Talent**: Ganti usia, hijab/non-hijab, tone kulit
2. **Variasi Setting**: Indoor studio / outdoor / kantor / rumah
3. **Variasi Mood**: Profesional / kasual / hangat / excited
4. **Variasi Kamera**: Close-up / medium / extreme close-up

Untuk setiap variasi, foto dan video prompt harus konsisten satu sama lain.

---

## Referensi Tambahan

- `references/prompt-elements.md` — Bank frasa untuk setiap elemen prompt
- `references/script-templates.md` — Template script per jenis konten
