# 📊 IdeaMill - Complete Flow Documentation

## 🎯 **PENTING: Foto Hanya Dikirim SEKALI di Awal!**

**✅ BENAR:** 1 foto produk + 1 foto model (optional) dikirim **sekali saja** untuk seluruh 100 variasi.
**❌ SALAH:** Tidak ada kirim foto per scene atau per variasi.

---

## 🔄 **Complete Flow (Step-by-Step)**

### **Step 1: User Upload (Frontend)**

```
User → Upload Foto Produk + Foto Model (optional)
  ↓
Frontend → Upload ke Supabase Storage
  ↓
Get Signed URLs:
  - productImageUrl: https://supabase.../product.jpg
  - modelImageUrl: https://supabase.../model.jpg (optional)
```

**📊 Cost:** 
- Upload 1x produk = 1 storage operation
- Upload 1x model (optional) = 1 storage operation
- **Total: 1-2 uploads untuk 100 variasi**

---

### **Step 2: API Create Generation**

```
POST /api/generations
  ↓
Create Generation Record (status: 'queued')
  ↓
Enqueue Job ke JobQueue (status: 'pending')
  ↓
Return generationId ke frontend
```

**📊 API Calls:** 1 call

---

### **Step 3: Worker Pick Up Job**

```
Worker Loop (poll setiap 3 detik)
  ↓
Find pending job
  ↓
Mark job as 'processing'
  ↓
Call runGeneration(genId, payload)
```

**📊 Cost:** Database query (minimal)

---

### **Step 4: L0 - Vision Analysis** ⚠️ **FOTO DIKIRIM DI SINI**

```typescript
// HANYA DI SINI foto dikirim ke OpenAI Vision API!

// 1. Analyze Product Image (1 API call dengan foto)
const product = await openai.visionDescribeProduct(payload.productImageUrl);
// Input: productImageUrl (URL ke Supabase Storage)
// Output: ProductDescription JSON:
//   {
//     brand: "...",
//     form_factor: "...",
//     colorway: "...",
//     key_benefit: "...",
//     category: "...",
//     notable_text: "..."
//   }

// 2. Analyze Model Image (1 API call dengan foto) - HANYA jika ada
const model = payload.modelImageUrl
  ? await openai.visionDescribeModel(payload.modelImageUrl)
  : await openai.genericModelDescribe(payload.basicIdea);
// Output: ModelDescription JSON:
//   {
//     age_range: "...",
//     gender: "...",
//     appearance: "...",
//     style: "..."
//   }
```

**📊 Cost:**
- 1 Vision API call (product image) = ~$0.01
- 1 Vision API call (model image, optional) = ~$0.01
- **Total L0: 1-2 Vision API calls untuk 100 variasi**

**💾 Storage:**
- ProductDescription disimpan ke `Products` table (1 row)
- ModelDescription disimpan ke `Models` table (1 row)

**Progress:** 5% → 10%

---

### **Step 5: L1 - Ideation (50 Angles)**

```typescript
const potentialIdeas = await openai.ideation50(product, payload.basicIdea);
// Input: ProductDescription JSON (dari L0) + basicIdea text
// Output: Array of 50 idea strings
// NO FOTO DI SINI - hanya pakai JSON description dari L0!
```

**📊 Cost:**
- 1 Text API call (GPT-4o) = ~$0.01-0.02
- **Total L1: 1 API call untuk 100 variasi**

**Progress:** 10% → (masih 10%, update setelah L2)

---

### **Step 6: L2 - Embed & Filter**

```typescript
// Embed 50 ideas ke vectors
const vectors = await openai.embedBatch(potentialIdeas, 20);
// Input: 50 text strings
// Output: 50 vectors (1536 dimensions each)

// Filter untuk 20 unique themes
const uniqueThemes = await pickUniqueThemes(...);
// Output: 20 unique themes

// Save to Ideas table
await insertIdeas(genId, uniqueThemes);
```

**📊 Cost:**
- Embedding API call (50 texts in batches of 20) = ~$0.001
- **Total L2: 1 Embedding API call untuk 100 variasi**

**Progress:** 10% → 35%

---

### **Step 7: L3-L4 - Script Generation (100 Scripts)**

```typescript
// Generate 5 scripts per theme (20 themes × 5 = 100 scripts)
const scriptPromises = uniqueThemes.map((theme) =>
  limit(async () => {
    return await openai.script5(theme.text);
    // Input: theme text (string)
    // Output: 5 scripts dengan struktur:
    //   [
    //     {
    //       id: "...",
    //       theme: "...",
    //       scenes: [
    //         { struktur: "Hook", naskah_vo: "...", visual_idea: "..." },
    //         { struktur: "Problem", ... },
    //         { struktur: "Solution", ... },
    //         { struktur: "CTA", ... }
    //       ]
    //     },
    //     ... (5 total)
    //   ]
  })
);
```

**📊 Cost:**
- 20 API calls (1 per theme) × $0.01-0.02 = ~$0.20-0.40
- **Total L3-L4: 20 Text API calls untuk 100 variasi**
- **NO FOTO DI SINI** - hanya pakai theme text!

**Progress:** 35% → 75%

---

### **Step 8: L5 - Visual Prompt Enrichment**

```typescript
// Enrich 100 scripts dengan visual prompts (chunked: 25 per batch)
const final = await openai.enrichVisualPrompts(
  product,    // ProductDescription JSON (dari L0)
  model,      // ModelDescription JSON (dari L0)
  overrides,  // Text string
  scripts100  // 100 scripts
);
// Input: JSON descriptions (TIDAK ada foto!)
// Output: Same 100 scripts dengan added fields:
//   scenes: [
//     {
//       struktur: "Hook",
//       naskah_vo: "...",
//       visual_idea: "...",
//       text_to_image: "...",  // NEW: detailed image prompt
//       image_to_video: "..."  // NEW: motion description
//     },
//     ...
//   ]
```

**📊 Cost:**
- 4 API calls (100 scripts ÷ 25 chunks) × $0.01-0.02 = ~$0.04-0.08
- **Total L5: 4 Text API calls untuk 100 variasi**
- **NO FOTO DI SINI** - hanya pass JSON descriptions!

**Progress:** 75% → 100%

---

### **Step 9: Persist to Database**

```typescript
await persistScriptsAndScenes(genId, final);
// Insert 100 Scripts
// Insert ~350-400 Scenes (100 scripts × 3-4 scenes each)
```

**📊 Cost:** Database operations (Supabase free tier friendly)

---

### **Step 10: Complete**

```typescript
await updateGen(genId, { status: 'completed', progress: 100 });
```

---

## 📊 **Summary: API Calls per Generation**

| Stage | API Type | Calls | Input | Foto? |
|-------|----------|-------|-------|-------|
| **L0** | Vision | 1-2 | Foto produk + foto model | ✅ **YA** (hanya di sini) |
| **L1** | Text | 1 | JSON description | ❌ Tidak |
| **L2** | Embedding | 1 | 50 text strings | ❌ Tidak |
| **L3-L4** | Text | 20 | 20 theme texts | ❌ Tidak |
| **L5** | Text | 4 | JSON descriptions | ❌ Tidak |
| **Total** | - | **27-28** | - | **1-2 foto untuk 100 variasi** |

---

## 💰 **Cost Breakdown (per Generation)**

### **OpenAI Costs (Estimated)**

- **Vision API (L0):**
  - Product image: ~$0.01
  - Model image (optional): ~$0.01
  - **Subtotal: $0.01-0.02**

- **Text API (L1, L3-L4, L5):**
  - L1 ideation: ~$0.01-0.02
  - L3-L4 scripts (20 calls): ~$0.20-0.40
  - L5 enrichment (4 calls): ~$0.04-0.08
  - **Subtotal: ~$0.25-0.50**

- **Embedding API (L2):**
  - 50 texts: ~$0.001
  - **Subtotal: ~$0.001**

**Total per Generation:** ~$0.26-0.52 untuk **100 variasi**

---

## ✅ **Key Points**

1. **Foto dikirim SEKALI di L0** - untuk analisa produk & model
2. **Hasil analisa (JSON)** dipakai untuk semua 100 variasi
3. **L1-L5 TIDAK kirim foto** - hanya pakai text/JSON
4. **Sangat efisien** - 1-2 foto untuk 100 variasi!
5. **Cost effective** - ~$0.30 per 100 variasi

---

## 🎯 **Efficiency Comparison**

### **❌ INEFFICIENT Approach (tidak digunakan):**
```
100 variasi × 4 scenes = 400 foto dikirim
Cost: 400 × $0.01 = $4.00 per generation
```

### **✅ EFFICIENT Approach (current system):**
```
1-2 foto dikirim sekali di awal
Cost: $0.01-0.02 per generation
Savings: 200-400x lebih murah! 💰
```

---

## 🔍 **Verification**

Jika Anda ingin verify, check log worker:
- Anda akan lihat: "L0: Vision analysis..." dengan 1-2 API calls
- L1-L5 tidak akan ada "image_url" di API calls
- Semua L1-L5 hanya pass JSON/text

---

**Kesimpulan: System ini SANGAT EFFICIENT! Foto hanya dikirim sekali di awal untuk analisa, lalu hasil analisa dipakai untuk generate 100 variasi tanpa perlu kirim foto lagi.** ✅

