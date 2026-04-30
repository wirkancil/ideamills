export const VISION_COMBINED_PROMPT = (brief: string) => `Kamu adalah analis visual untuk advertising. Analisis foto produk dan foto model (jika ada) untuk konteks ide iklan video Indonesia.

Brief user: "${brief || '(kosong)'}"

ATURAN KETAT — WAJIB IKUTI:

1. BRIEF = SOURCE OF TRUTH untuk product info.
   - Kalau brief sebut nama brand/produk spesifik (contoh "GlowBooster 7 Active Ingredients"), gunakan PERSIS itu untuk "brand".
   - Kalau brief sebut benefit/category, pakai dari brief.
   - Vision foto HANYA dipakai untuk visual properties (warna, bentuk, posisi label).

2. JANGAN MENEBAK info yang tidak ada bukti.
   - Kalau brief tidak sebut benefit dan tidak terlihat di kemasan → "key_benefit": ""
   - Kalau brief tidak sebut target audience → "target_audience": ""
   - Kalau brand tidak terbaca jelas dan brief kosong → "brand": ""
   - Field kosong > field halusinasi.

3. HANYA isi yang TERLIHAT di foto atau TERTULIS di brief.
   - "color_scheme": warna kemasan yang benar-benar terlihat
   - "form_factor": bentuk produk yang terlihat (contoh "botol dropper", "tube squeeze")
   - "notable_text": text yang BENAR-BENAR terbaca di label, jangan tebak
   - "style": vibe visual produk dari foto (contoh "minimalist clean", "bold colorful")

4. JANGAN tambah descriptor yang tidak ada.
   - Jangan sebut elemen yang tidak ada di foto (box, kemasan luar, props)
   - Jangan tambah klaim ("premium", "luxury", "natural") kecuali tertulis di label atau brief

Return JSON:
{
  "productAnalysis": {
    "brand": "(dari brief atau label, kosongkan kalau tidak ada)",
    "category": "(dari brief atau yang jelas terlihat)",
    "form_factor": "(bentuk produk yang terlihat)",
    "color_scheme": "(warna kemasan yang terlihat)",
    "key_benefit": "(dari brief atau label, kosongkan kalau tidak ada)",
    "target_audience": "(dari brief, kosongkan kalau tidak ada)",
    "style": "(vibe visual produk)",
    "notable_text": "(text yang TERBACA di label, kosongkan kalau tidak ada)"
  },
  "modelAnalysis": {
    "age_range": "...",
    "gender": "...",
    "ethnicity": "...",
    "appearance": "...",
    "style": "..."
  } | null
}

Untuk modelAnalysis: kalau foto model ada, deskripsikan yang terlihat. Kalau tidak ada foto model dan brief tidak sebut, beri persona suggestion ringan berdasarkan target_audience (kalau ada).

ATURAN UMUR: untuk "age_range", DEFAULT pakai "25-35 years old" kalau:
- Brief tidak sebut umur spesifik, ATAU
- Foto model tidak terlihat (no photo provided)
JANGAN tulis umur di bawah 25 (Imagen filter content moderation reject usia muda untuk avoid minor depiction issues). Kalau brief eksplisit minta usia muda (misal "Gen Z 20-an"), pakai minimal "23-28 years old".

Bahasa Indonesia untuk field naratif (style, appearance), Inggris boleh untuk technical terms (form_factor, etc).`;

export const IDEAS_SYSTEM = `Kamu adalah Senior Creative Strategist untuk iklan video viral Indonesia. Generate ide iklan yang relevan, kreatif, dan match dengan target audience.`;

export const IDEAS_USER = (productAnalysis: unknown, modelAnalysis: unknown, brief: string) => `PRODUK: ${JSON.stringify(productAnalysis)}
MODEL: ${JSON.stringify(modelAnalysis)}
BRIEF: "${brief || '(tidak ada)'}"

Generate 3-5 ide iklan video 30 detik untuk produk ini. Setiap ide harus:
- title: singkat menarik (max 60 char)
- content: 1 paragraf naratif (60-200 kata) yang sudah include:
  * Konteks visual (model, setting, vibe)
  * Storyline ringkas (apa yang terjadi di video)
  * Tone & mood
  * Why it works untuk target audience

Return JSON: { "ideas": [{ "title": "...", "content": "..." }] }`;

export const EXPAND_SYSTEM = `Kamu adalah Veo prompt specialist untuk iklan video Indonesia. Tugasmu men-design SATU clip prompt 8 detik berkualitas tinggi dari sebuah ide iklan.`;

export const EXPAND_USER = (
  productAnalysis: unknown,
  modelAnalysis: unknown,
  selectedIdea: { title: string; content: string }
) => `PRODUK: ${JSON.stringify(productAnalysis)}
MODEL: ${JSON.stringify(modelAnalysis)}
IDE TERPILIH:
  Title: "${selectedIdea.title}"
  Content: ${selectedIdea.content}

Tugas:

1. Tulis "productNotes" — 1 paragraf product detail saja, OPTIMAL untuk image generation (Imagen / Nano Banana).

   FORMAT: 1 paragraf padat naratif (BUKAN bullet, BUKAN multi-kalimat repetitif). Sebut subject HANYA SEKALI di awal, lalu attribut menyusul tanpa mengulang kata.

   YANG WAJIB DI-COVER (tapi sebut sekali, tidak diulang):
   - Nama brand persis dari brief
   - Form factor + material + finish (1 frase saja, contoh: "transparent glass dropper bottle with white plastic cap")
   - Layout label + text yang terbaca (gabung jadi 1 frase: "front-centered white label, 'GlowBooster' top in bold black sans-serif, large '7' middle, '7 GLOWING POWER IN 1 BOTTLE' bottom")
   - Ukuran (1 frase: "approximately 15ml palm-sized")

   CONTOH OUTPUT BAGUS (~50 kata, tanpa duplikasi):
   "GlowBooster 7 Active Ingredients, transparent glass dropper bottle with white plastic cap, front-centered white label with bold black sans-serif typography: 'GlowBooster' brand at top, large numeric '7' in middle, '7 GLOWING POWER IN 1 BOTTLE' subtitle below. Approximately 15ml palm-sized, minimalist clean design."

   ATURAN ANTI-DUPLIKASI:
   - JANGAN sebut "botol" / "bottle" lebih dari 1x
   - JANGAN sebut warna yang sama berkali-kali ("putih" muncul 4x = bad)
   - JANGAN ulang nama brand di tengah paragraf — sebut sekali di awal saja
   - JANGAN tulis kalimat berurutan dengan subject sama ("Botol terbuat dari... Botol dengan label... Botol berukuran...")

   ATURAN OPTIMAL UNTUK IMAGE GEN:
   - PAKAI visual descriptors konkret yang bisa di-render: warna spesifik, material, finish, layout, posisi.
   - HINDARI abstract claims: "premium aesthetic", "approachable feel", "luxury vibe" — Imagen tidak bisa render konsep abstrak.
   - JANGAN sertakan info model, setting, lighting, atau kondisi pemakaian — itu masuk styleNotes.
   - Panjang ideal: 40-80 kata. Padat tanpa duplikasi.

2. Tulis "styleNotes" — 1 paragraf visual style saja:
   - Model appearance: umur, gender, ethnicity, hijab/no, style pakaian
   - Setting/lokasi (tembok, sofa, ruangan, exterior)
   - Lighting (natural, soft, indoor warm, golden hour, dll)
   - Tone & mood video
   - JANGAN sertakan nama produk atau product detail di sini.

   ATURAN ANTI CONTENT-FILTER (Imagen Google Flow sangat strict, ikuti ATAU image gen akan reject):
   - Umur model: WAJIB 25-35 years old (atau lebih tua). JANGAN tulis "18 years old", "20 years old", "young teen", "remaja" — kena filter PROMINENT_PEOPLE / minor depiction.
   - JANGAN sebut "TikTok creator", "Gen Z creator", "viral creator", "influencer" — Imagen interpret sebagai targeting public figure spesifik.
   - JANGAN sebut nama public figure (artis, selebriti, politisi).
   - Pakai descriptor neutral: "everyday person", "casual home video style", "authentic candid feel" — bukan "viral content" atau "creator content".
   - Tone OK: "warm conversational", "genuine review", "homely casual" — hindari "playful Gen Z vibe" yang spesifik demografi.

3. Tulis SATU "clip" prompt untuk video iklan 8 detik.

   PRINSIP UTAMA — VIDEO 8 DETIK:
   Veo bisa render natural micro-expression (glance, smile, laugh, blink, head tilt, lip
   movement) dalam 1 take 8 detik. Yang TIDAK muat: rangkaian MAJOR ACTION yang ubah
   posisi/situasi besar (duduk → berdiri → jalan → bending). Pilih 1-2 major action
   + banyak micro-expression untuk feel natural.

   TARGET PANJANG CLIP PROMPT: max 2000 karakter. Hindari deskripsi yang berulang.

   WAJIB dalam prompt:
   a. Model berbicara langsung ke kamera — sertakan SATU dialog Bahasa Indonesia, ditulis inline sebagai: model berbicara: "[dialog]"
      ATURAN KETAT DIALOG (untuk video 8 detik):
      - HANYA SATU dialog dalam seluruh prompt. JANGAN tulis "model berbicara: ..." dua kali atau lebih.
      - Dialog MAKSIMAL 15 kata. Hitung kata sebelum tulis. Lebih dari 15 kata akan terpotong di video.
      - 1-2 kalimat pendek saja, hindari kalimat majemuk panjang dengan banyak klausa.
      - Pilih hook punchy yang relevan dengan ide. Contoh OK (15 kata atau kurang):
        ✓ "Aku akhirnya nemu serum yang bikin kulitku auto glowing dari pemakaian pertama!" (12 kata)
        ✓ "Cobain GlowBooster, kulitku jadi cerah natural tanpa perlu makeup tebal." (10 kata)
        ✗ "Udah coba macam-macam serum tapi belum nemu yang pas? Sini merapat, aku kasih tau pengalaman aku pakai produk ini!" (20 kata, terlalu panjang)
      - Lebih dari 15 kata atau lebih dari 1 dialog block = video akan terpotong.
   b. Lipsync eksplisit: tulis "model berbicara langsung ke kamera, bibir bergerak sinkron dengan ucapan"
   c. Kamera statis (sudah include di struktur poin 1)
   d. Single take (sudah include di struktur poin 1)
   e. Clean frame (sudah include di struktur poin 5)

   ATURAN AKSI (untuk muat dan natural di 8 detik):
   - MAKSIMAL 2 MAJOR ACTION (perubahan posisi/situasi besar). Lebih dari 2 = yang terakhir TIDAK akan dirender.
   - MICRO-EXPRESSION DIIZINKAN dan dianjurkan untuk feel natural: glance, smile, blink, laugh, lip movement, head tilt, eye contact, slight nod, eyebrow raise. Veo handle ini dengan baik dalam 8 detik.
   - Contoh OK (1-2 major action + banyak micro-expression):
     ✓ "model holds product near face (action 1), smiles warmly with playful glance, speaks to camera with natural micro-expressions, lifts product slightly toward camera at end (action 2)"
   - Contoh TIDAK OK (3+ major action — Veo skip yang akhir):
     ✗ "model duduk di sofa, lalu berdiri, lalu walk to mirror, lalu bend over to grab bottle, lalu speak"
     ✗ "model holds product, then puts it down, then picks up another product, then speaks, then lifts again"

   DILARANG dalam prompt:
   - Kata "CTA", "call-to-action", "tagline" — ganti dengan deskripsi visual aksi model
   - Negation phrases: "no X", "not X", "tidak X", "tanpa X", "bukan X", "jangan X" — selalu pakai positive equivalent
   - Kata "subtitle", "teks", "tulisan", "overlay"
   - Duplikasi info yang sudah ada di productNotes/styleNotes (sistem akan prepend keduanya otomatis sebelum kirim ke Veo)

   Contoh convert negation ke positive (wajib ikuti):
   - "tidak terlalu terang" → "soft natural indoor lighting"
   - "tidak ada flicker" → "stable steady lighting"
   - "tidak kaku" → "relaxed natural movement"
   - "bukan iklan hard selling" → "authentic conversational tone"
   - "no AI artifacts" → "natural photographic quality"
   - "no fast movement" → "slow deliberate motion"

   Format prompt: 1 paragraf naratif (max 2000 karakter), Bahasa Indonesia untuk dialog/VO, Bahasa Inggris untuk technical visual terms.

Return JSON:
{
  "productNotes": "...",
  "styleNotes": "...",
  "clips": [
    { "prompt": "..." }
  ]
}`;

export const ENHANCE_PROMPT_SYSTEM = `Kamu adalah Veo prompt copy-editor. Tugasmu SANGAT TERBATAS:

ATURAN MUTLAK:
1. HANYA flip negation phrases in-place. Cari "no X", "not X", "tidak X", "tanpa X", "bukan X", "jangan X", "(bukan ...)", "(no ...)" → ganti dengan positive equivalent yang express what's wanted.
2. JANGAN tambah konten baru. JANGAN tambah action, dialog, sound, motion, camera direction, atau atribut yang tidak disebut di original.
3. JANGAN hapus detail specific. Pertahankan SEMUA: warna, brand name, parenthetical clarifications, ukuran, posisi, material, lighting setup, dll.
4. JANGAN paraphrase. Pertahankan kalimat dan struktur original 100%, kecuali untuk bagian negation yang harus di-flip.
5. Output length WAJIB dalam range ±10% dari input. Kalau jauh berbeda, kamu salah.
6. Kalau TIDAK ADA negation di input, return input VERBATIM (sama persis, tanpa perubahan).

CONTOH FLIP NEGATION (in-place, minimal change):
- "tidak terlalu terang" → "soft dimmed lighting"
- "(bukan berlebihan)" → "(subtle and natural)"
- "(realistic, bukan flawless AI)" → "(authentic with natural skin texture)"
- "no cuts" → "single continuous take"
- "no AI artifacts" → "natural photographic quality"
- "tanpa flicker" → "stable steady lighting"

YANG TIDAK BOLEH KAMU LAKUKAN:
- Tambah "lip sync akurat", "kepala mengangguk", "tempo medium-slow" jika tidak ada di original.
- Tambah "ultra realistic", "TikTok vibe" jika tidak ada di original.
- Re-strukturisasi kalimat menjadi lebih pendek atau lebih singkat untuk "polish".
- Convert frasa positive yang sudah ada (seperti "static eye-level") menjadi varian lain.

Output format: HANYA prompt hasil flip (atau prompt original verbatim kalau tidak ada negation). Tanpa preamble. Tanpa penjelasan. Tanpa markdown.`;

export const ENHANCE_PROMPT_USER = (rawPrompt: string) => `Flip negation di prompt berikut. Pertahankan SEMUA detail lain persis sama. Kalau tidak ada negation, return verbatim:

${rawPrompt}`;
