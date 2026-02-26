# 📝 Dokumentasi Prompt OpenAI GPT

Dokumentasi lengkap semua prompt dan input yang dikirim ke GPT di setiap tahap generation.

---

## 🔄 **Tahap L0: Vision Analysis (10%)**

### **1. Product Vision Analysis** (`visionDescribeProduct`)

**Input yang dikirim:**
- ✅ **Gambar produk** (base64 data URI atau URL)
- ✅ **basicIdea** (jika ada): Ide/konsep produk
- ✅ **visualDescription/visualOverrides** (jika ada): Deskripsi visual

**Prompt lengkap:**
```
Analyze this product image and return STRICT JSON with these fields:
{
  "brand": "brand name if visible",
  "form_factor": "physical form (bottle, tube, jar, etc)",
  "colorway": "main colors",
  "key_benefit": "primary benefit or claim",
  "category": "product category",
  "notable_text": "any text visible on product"
}

Context - Product Idea: "[basicIdea]"
Please focus on aspects relevant to this concept when analyzing the image.

Visual Description/Overrides: "[visualOverrides]"
Use this description to guide your analysis and focus on matching visual elements mentioned.
```

**Model:** `gpt-4o`  
**Format:** `json_object`  
**Max Tokens:** 300  
**Output:** `ProductDescription` JSON

---

### **2. Model Vision Analysis** (`visionDescribeModel`) - Optional

**Input yang dikirim:**
- ✅ **Gambar model** (base64 data URI atau URL)

**Prompt lengkap:**
```
Analyze this model/person image and return STRICT JSON:
{
  "age_range": "estimated age range",
  "gender": "gender presentation",
  "ethnicity": "ethnicity/appearance",
  "appearance": "general appearance description",
  "style": "clothing/styling notes"
}
```

**Model:** `gpt-4o`  
**Format:** `json_object`  
**Max Tokens:** 200  
**Output:** `ModelDescription` JSON dengan `source: 'vision'`

---

### **3. Generic Model Description** (`genericModelDescribe`) - Jika tidak ada model image

**Input yang dikirim:**
- ✅ **basicIdea**: Ide/konsep produk

**Prompt lengkap:**
```
Based on this product idea: "[basicIdea]", suggest a target audience persona in JSON:
{
  "age_range": "target age",
  "gender": "target gender",
  "appearance": "suggested model appearance",
  "style": "suggested styling"
}
```

**Model:** `gpt-4o`  
**Format:** `json_object`  
**Max Tokens:** 150  
**Output:** `ModelDescription` JSON dengan `source: 'generic'`

---

## 🧠 **Tahap L1: Ideation (35%)**

### **Ideation 50 Angles** (`ideation50`)

**Input yang dikirim:**
- ✅ **Product** (JSON): ProductDescription dari L0
- ✅ **basicIdea**: Ide/konsep produk

**System Message:**
```
You are a creative marketing strategist specializing in ad concepts.
```

**User Prompt lengkap:**
```
Generate 50 distinct marketing angles for this product:
Product: {
  "brand": "...",
  "form_factor": "...",
  "colorway": "...",
  "key_benefit": "...",
  "category": "...",
  "notable_text": "..."
}
Basic Idea: [basicIdea]

Cover these categories:
- Problem-solution angles (15)
- Lifestyle/aspiration angles (15)
- Social proof/UGC angles (10)
- Educational/how-to angles (5)
- Trend/seasonal angles (5)

Return as JSON array of strings: ["angle 1", "angle 2", ...]
```

**Model:** `gpt-4o`  
**Format:** `json_object`  
**Max Tokens:** 2000  
**Output:** Array of 50 marketing angle strings

---

## 📝 **Tahap L3: Script Generation (75%)**

### **Script 5 Variations** (`script5`)

**Input yang dikirim:**
- ✅ **theme**: String tema/angle (dari 20 unique themes setelah filtering)

**System Message:**
```
You are an expert ad scriptwriter. Create concise, impactful scripts.
```

**User Prompt lengkap:**
```
Create 5 different script variations for this theme: "[theme]"

Each script must have 3-4 scenes with this structure:
{
  "id": "unique_id",
  "theme": "[theme]",
  "scenes": [
    {
      "struktur": "Hook",
      "naskah_vo": "voiceover text in Bahasa Indonesia",
      "visual_idea": "visual description"
    },
    {
      "struktur": "Problem",
      "naskah_vo": "...",
      "visual_idea": "..."
    },
    {
      "struktur": "Solution",
      "naskah_vo": "...",
      "visual_idea": "..."
    },
    {
      "struktur": "CTA",
      "naskah_vo": "...",
      "visual_idea": "..."
    }
  ]
}

Keep each script under 320 tokens total. Return JSON array of 5 scripts.
```

**Model:** `gpt-4o`  
**Format:** `json_object`  
**Max Tokens:** 2500  
**Output:** Array of 5 scripts (total: 20 themes × 5 = 100 scripts)

**Dipanggil:** 20 kali paralel (satu per unique theme)

---

## 🎨 **Tahap L5: Visual Prompt Enrichment (75-100%)**

### **Enrich Visual Prompts** (`enrichVisualPrompts`)

**Input yang dikirim:**
- ✅ **Product** (JSON): ProductDescription dari L0
- ✅ **Model** (JSON): ModelDescription dari L0
- ✅ **overrides**: visualOverrides dari user (string)
- ✅ **scripts**: 25 scripts per batch (total 100 scripts dalam 4 batch)

**System Message:**
```
You are a visual prompt engineer for AI image/video generation.
```

**User Prompt lengkap:**
```
Enrich these scripts with visual prompts.

Product Style: {
  "brand": "...",
  "form_factor": "...",
  "colorway": "...",
  "key_benefit": "...",
  "category": "...",
  "notable_text": "..."
}
Model Style: {
  "age_range": "...",
  "gender": "...",
  "ethnicity": "...",
  "appearance": "...",
  "style": "...",
  "source": "vision" atau "generic"
}
Overrides: [visualOverrides atau "none"]

For each scene, add:
- "text_to_image": detailed prompt for static image generation
- "image_to_video": motion/animation description

Return the same JSON structure with added fields.

Scripts: [
  {
    "id": "...",
    "theme": "...",
    "scenes": [
      {
        "struktur": "Hook",
        "naskah_vo": "...",
        "visual_idea": "..."
      },
      ...
    ]
  },
  ... (25 scripts total)
]
```

**Model:** `gpt-4o`  
**Format:** `json_object`  
**Max Tokens:** 3000  
**Output:** Array of enriched scripts dengan field tambahan:
- `text_to_image`: Detailed image generation prompt
- `image_to_video`: Motion/animation description

**Dipanggil:** 4 kali (batch processing: 25 scripts per batch)

---

## 🔢 **Tahap L2: Embedding (Internal - tidak ada prompt)**

### **Embed Batch** (`embedBatch`)

**Input yang dikirim:**
- ✅ **Texts**: Array of strings (50 ideas, dibagi batch 20)

**API:** `openai.embeddings.create()`  
**Model:** `text-embedding-3-small` (atau dari env `OPENAI_EMBED_MODEL`)  
**Input:** Array of strings (batch size: 20)  
**Output:** Array of embedding vectors (1536 dimensions)

**Tidak ada prompt** - ini adalah embedding API, bukan chat completion.

---

## 📊 **Ringkasan: Input ke GPT per Tahap**

| Tahap | API Call | Input Dikirim | Model | Max Tokens | Jumlah Calls |
|-------|----------|---------------|-------|------------|--------------|
| **L0 - Product Vision** | Chat Completion | Image (base64) + basicIdea + visualOverrides | gpt-4o | 300 | 1 |
| **L0 - Model Vision** | Chat Completion | Image (base64) | gpt-4o | 200 | 1 (optional) |
| **L0 - Generic Model** | Chat Completion | basicIdea | gpt-4o | 150 | 1 (jika tidak ada model image) |
| **L1 - Ideation** | Chat Completion | Product JSON + basicIdea | gpt-4o | 2000 | 1 |
| **L2 - Embedding** | Embeddings | 50 idea strings | text-embedding-3-small | N/A | 3 batches |
| **L3 - Scripts** | Chat Completion | theme (string) | gpt-4o | 2500 | 20 (paralel) |
| **L5 - Visual Enrich** | Chat Completion | Product JSON + Model JSON + scripts (25) | gpt-4o | 3000 | 4 (sequential) |

---

## 🔑 **Kunci Penting:**

1. **Foto HANYA dikirim di L0** (Vision Analysis) - sekali saja untuk seluruh 100 variasi
2. **L1-L5 menggunakan JSON descriptions** - tidak ada foto lagi
3. **basicIdea dan visualOverrides** dikirim di L0 dan L5 untuk konteks
4. **Product & Model JSON** digunakan di L1, L3, dan L5 untuk konsistensi visual
5. **Semua output dalam format JSON** untuk memudahkan parsing

---

## 💰 **Estimasi Cost per Generation:**

- **L0 Vision:** 1-2 calls × $0.01-0.03 = $0.01-0.06
- **L1 Ideation:** 1 call × $0.01-0.02 = $0.01-0.02
- **L3 Scripts:** 20 calls × $0.01-0.02 = $0.20-0.40
- **L5 Visual Enrich:** 4 calls × $0.01-0.03 = $0.04-0.12
- **Total:** ~$0.26-0.60 per 100 variasi script

---

## 📝 **Contoh Output:**

### L0 - Product Description:
```json
{
  "brand": "BrandName",
  "form_factor": "bottle",
  "colorway": "white, gold accents",
  "key_benefit": "anti-aging, hydration",
  "category": "skincare",
  "notable_text": "SPF 50, Vitamin C"
}
```

### L3 - Script:
```json
{
  "id": "script_001",
  "theme": "Transform your skin in 7 days",
  "scenes": [
    {
      "struktur": "Hook",
      "naskah_vo": "Bayangkan kulit yang bersinar setiap pagi",
      "visual_idea": "Close-up wajah bersinar dengan natural lighting"
    },
    {
      "struktur": "Problem",
      "naskah_vo": "Kulit kusam dan tidak terawat?",
      "visual_idea": "Split screen showing before/after"
    },
    {
      "struktur": "Solution",
      "naskah_vo": "Dengan [Product], hasil terlihat dalam 7 hari",
      "visual_idea": "Product in use, montage of results"
    },
    {
      "struktur": "CTA",
      "naskah_vo": "Dapatkan sekarang di [platform]",
      "visual_idea": "Product with call-to-action overlay"
    }
  ]
}
```

### L5 - Enriched Script:
```json
{
  "id": "script_001",
  "theme": "Transform your skin in 7 days",
  "scenes": [
    {
      "struktur": "Hook",
      "naskah_vo": "Bayangkan kulit yang bersinar setiap pagi",
      "visual_idea": "Close-up wajah bersinar dengan natural lighting",
      "text_to_image": "Professional close-up portrait of Indonesian woman in her 30s with radiant, glowing skin. Soft natural morning light. Minimalist white background. Elegant skincare aesthetic. High quality, realistic, commercial photography style.",
      "image_to_video": "Slow zoom in on face. Gentle morning light gradually brightening. Subtle skin glow animation. Serene, calming motion."
    },
    ...
  ]
}
```

