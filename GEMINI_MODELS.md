# Gemini Models - IdeaMill

## Model yang Digunakan

IdeaMill sekarang menggunakan **Gemini 1.5 Flash** sebagai default.

## Kenapa Gemini 1.5 Flash?

✅ **Lebih Cepat** - Response time ~50% lebih cepat  
✅ **Lebih Murah** - ~10x lebih murah dari GPT-4o  
✅ **Cukup Powerful** - Untuk ideation & scripting sudah sangat cukup  
✅ **Context Window Besar** - 1M tokens context  

## Model Options

### 1. gemini-1.5-flash (DIGUNAKAN SEKARANG)
- **Fastest** and **cheapest**
- Best untuk: Ideation, Scripting
- Pricing: $0.075 / 1M input tokens

### 2. gemini-1.5-pro
- More powerful tapi lebih mahal
- Best untuk: Complex reasoning
- Pricing: $1.25 / 1M input tokens

### 3. gemini-1.5-flash-8b
- Ultra cheap, tapi kurang powerful
- Best untuk: Simple tasks only
- Pricing: $0.0375 / 1M input tokens

## Cara Ganti Model

Edit file `app/lib/adapters/gemini.ts`:

```typescript
// Option 1: Flash (default - recommended)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Option 2: Pro (lebih powerful)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

// Option 3: Flash 8B (ultra cheap)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-8b' });
```

## Cost Comparison (per 100 variations)

| Model | Cost per 100 | Speed | Quality |
|-------|-------------|-------|---------|
| GPT-4o | ~$0.80 | Medium | Excellent |
| Gemini 1.5 Pro | ~$0.30 | Fast | Excellent |
| **Gemini 1.5 Flash** | **~$0.08** | **Fastest** | **Very Good** ⭐ |
| Gemini 1.5 Flash 8B | ~$0.04 | Ultra Fast | Good |

## Recommendation

**Development/Testing**: Gemini 1.5 Flash (cheap & fast)  
**Production**: GPT-4o atau Gemini 1.5 Pro (best quality)  
**High Volume**: Gemini 1.5 Flash (cost effective)

## Current Setup

✅ Frontend UI: Bisa pilih engine (GPT-4o atau Gemini)  
✅ Gemini menggunakan: **gemini-1.5-flash**  
✅ Cost per 100 variations: ~$0.08 (Gemini) vs ~$0.80 (GPT-4o)

---

**TL;DR**: IdeaMill sekarang pakai **Gemini 1.5 Flash** - 10x lebih murah, 2x lebih cepat! 🚀

