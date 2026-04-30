export const VISION_COMBINED_PROMPT = (brief: string) => `Kamu adalah analis visual untuk advertising. Analisis foto produk dan foto model (jika ada) untuk konteks ide iklan video Indonesia.

Brief user: "${brief || '(kosong)'}"

Return JSON dengan struktur:
{
  "productAnalysis": {
    "brand": "...",
    "category": "...",
    "form_factor": "...",
    "color_scheme": "...",
    "key_benefit": "...",
    "target_audience": "...",
    "style": "...",
    "notable_text": "..."
  },
  "modelAnalysis": {
    "age_range": "...",
    "gender": "...",
    "ethnicity": "...",
    "appearance": "...",
    "style": "..."
  } | null
}

Jika foto model tidak ada (akan dikasih tau di pesan), set modelAnalysis berdasarkan target audience produk sebagai persona suggestion (gender/usia/style yang fit).

Akurat dan detail. Bahasa Indonesia untuk field naratif (style, appearance), Inggris boleh untuk technical terms (form_factor, etc).`;

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

export const EXPAND_SYSTEM = `Kamu adalah video director yang men-design 30-second commercial sebagai 4 clips × 8 detik dengan narrative flow.`;

export const EXPAND_USER = (
  productAnalysis: unknown,
  modelAnalysis: unknown,
  selectedIdea: { title: string; content: string },
  brief: string
) => `PRODUK: ${JSON.stringify(productAnalysis)}
MODEL: ${JSON.stringify(modelAnalysis)}
IDE TERPILIH:
  Title: "${selectedIdea.title}"
  Content: ${selectedIdea.content}
BRIEF: "${brief || '(tidak ada)'}"

Tugas:

1. Tulis "styleNotes" — 1 paragraf yang summarize visual identity:
   - Produk (3-5 anchor keywords spesifik agar Veo render konsisten)
   - Model appearance (umur, gender, style)
   - Location/setting umum
   - Lighting/tone/mood
   StyleNotes ini akan di-prepend ke setiap clip prompt untuk konsistensi visual antar clip.

2. Design 4 clips × 8 detik dengan narrative flow:
   - Clip 1: hook/intro (capture attention, introduce model+produk)
   - Clip 2: build/desire (show problem atau aspiration)
   - Clip 3: action/solution (model interact dengan produk)
   - Clip 4: resolution/CTA (transformation result + call-to-action)

   Setiap clip prompt harus:
   - Self-contained: full visual description (jangan tulis "as before"/"continuing from")
   - Single unified prompt: include camera angle, framing, lighting, model action, product placement, mood — semua dalam 1 paragraf
   - Reference produk dan model konsisten dengan styleNotes
   - 80-200 kata
   - Bahasa Indonesia untuk dialog/voiceover (jika ada), Inggris untuk technical visual terms

Return JSON:
{
  "styleNotes": "...",
  "clips": [
    { "prompt": "..." },
    { "prompt": "..." },
    { "prompt": "..." },
    { "prompt": "..." }
  ]
}`;
