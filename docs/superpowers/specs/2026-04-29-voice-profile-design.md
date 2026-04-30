# Voice Profile per Talent — Design Spec

**Tanggal**: 2026-04-29
**Status**: Draft, awaiting user review
**Pendekatan**: A (per-Generation field, bukan Talent Library reusable)

## Latar Belakang

Veo 3.1 Fast (model video default di IdeaMills) generate audio dialog secara native dari deskripsi prompt. Tapi pipeline L5 sekarang ([app/lib/llm/prompts.ts](../../../app/lib/llm/prompts.ts)) hanya menginjeksikan visual style — **tidak ada audio direction**. Akibatnya:

- Voice character (gender, umur, aksen, mood) random per scene
- Konsistensi voice antar scene tidak terkontrol
- User tidak punya cara meminta voice tertentu untuk talent yang di-upload

Pipeline alternatif (TTS + voice cloning di service eksternal) sudah ditolak karena menambah dependensi API dan biaya. Solusi ini tetap pakai useapi.net + Veo saja.

## Tujuan

User bisa menulis deskripsi voice character ketika upload foto model. Deskripsi tersebut dipakai otomatis di setiap scene Veo, sehingga voice output konsisten dan sesuai preferensi user.

## Non-Goals

- ❌ Voice cloning dari sample audio (butuh TTS eksternal — di luar scope)
- ❌ Talent library reusable lintas generation (deferred ke v2 jika perlu)
- ❌ TTS overlay / audio post-processing (butuh FFmpeg pipeline — di luar scope)
- ❌ Voice consistency 100% — Veo native audio inherently variabel ~70-80%

## Pendekatan: Per-Generation Voice Profile

Setiap dokumen `Generations` di MongoDB dapat field tambahan `voice_profile` (string deskripsi). Field ini diisi user di step upload model. Worker pipeline ambil field ini dari DB dan pass ke L5 visualPrompt enrichment.

### Alternatif yang ditolak

**Talent Library** (collection `Talents` reusable): butuh CRUD page baru, API routes baru, dropdown picker di UI. Total ~15 file diubah, ~500 baris. Overkill untuk MVP. Bisa di-upgrade nanti dengan migrasi field `voice_profile` per-generation ke collection terpisah.

## Perubahan

### 1. Schema ([app/lib/types.ts](../../../app/lib/types.ts))

Tambah field opsional di tiga interface:

```ts
export interface GenerationJobPayload {
  // ... existing fields
  voiceProfile?: string;
}

export interface DBGeneration {
  // ... existing fields
  voice_profile?: string;
}
```

Field bersifat **optional** — generation existing tanpa `voice_profile` tetap berjalan (Veo akan generate voice random seperti sebelumnya).

### 2. L5 Prompt ([app/lib/llm/prompts.ts](../../../app/lib/llm/prompts.ts))

`VISUAL_PROMPT_USER` accept parameter baru `voiceProfile?: string`. Section baru di prompt:

```
AUDIO DIRECTION (when talent is on-camera):
Voice character: <voice_profile>

For every scene where the talent speaks, include in `image_to_video`:
- Voice tone description matching above
- Dialog wrapped in quotation marks: 'says: "<dialogue>"'
- Maintain voice consistency across all scenes
```

Section ini di-skip otomatis kalau `voiceProfile` kosong/undefined (backward compatible).

### 3. LLM Layer ([app/lib/llm/index.ts](../../../app/lib/llm/index.ts))

`enrichVisualPrompts` (line 215) accept parameter `voiceProfile?: string`, pass ke `VISUAL_PROMPT_USER` (line 235).

### 4. Callers `enrichVisualPrompts`

Tiga caller harus pass `voice_profile` dari context:

- [worker/runGeneration.ts:725](../../../worker/runGeneration.ts) — baca `voice_profile` dari `Generations` doc
- [app/api/generate-directors-script/route.ts:102](../../../app/api/generate-directors-script/route.ts) — baca dari payload
- [app/api/studio/generate-veo-prompts/route.ts:76](../../../app/api/studio/generate-veo-prompts/route.ts) — baca dari payload

### 5. API ([app/api/generations/route.ts](../../../app/api/generations/route.ts))

Schema validation Zod tambah `voiceProfile` (line 14):

```ts
voiceProfile: z.string().max(500).optional(),
```

Save ke MongoDB sebagai `voice_profile` (line 160).

### 6. UI

Dua tempat upload model:

- [app/components/InputForm.tsx:104](../../../app/components/InputForm.tsx) — main flow
- [app/studio/page.tsx:228](../../../app/studio/page.tsx) — studio flow

Tambahkan section "Voice Character" setelah upload model image:

```tsx
<section>
  <label>Voice Character (opsional)</label>
  <select onChange={(e) => setVoiceProfile(e.target.value)}>
    <option value="">— Custom —</option>
    {VOICE_PRESETS.map(p => <option key={p.id} value={p.description}>{p.label}</option>)}
  </select>
  <textarea
    value={voiceProfile}
    onChange={(e) => setVoiceProfile(e.target.value)}
    placeholder="e.g. warm caring female voice, 32-year-old Indonesian, soft genuine tone, slight smile in voice, medium pace"
    maxLength={500}
  />
</section>
```

Preset dropdown auto-fill textarea, user bisa edit lebih lanjut.

### 7. Voice Presets Library (file baru)

`app/lib/voicePresets.ts`:

```ts
export interface VoicePreset {
  id: string;
  label: string;
  description: string;
}

export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: 'remaja-ceria',
    label: 'Remaja ceria',
    description: 'Bright cheerful young female voice, 16-year-old Indonesian, playful innocent tone, fast excited pace, school-age energy',
  },
  {
    id: 'mahasiswi-genz',
    label: 'Mahasiswi Gen Z',
    description: 'Bright youthful female voice, 20-year-old Indonesian, Jakarta accent, trendy upbeat tone, casual slang-friendly, fast pace',
  },
  {
    id: 'influencer-trendy',
    label: 'Influencer trendy',
    description: 'Bright social-media-style female voice, 22-year-old Indonesian, Jakarta accent, expressive enthusiastic tone, fast pace, slight vocal fry',
  },
  {
    id: 'wanita-muda-energik',
    label: 'Wanita muda energik',
    description: 'Bright energetic female voice, 24-year-old Indonesian, Jakarta accent, casual upbeat tone, medium pace, friendly and approachable',
  },
  {
    id: 'beauty-advisor',
    label: 'Beauty advisor',
    description: 'Smooth confident female voice, 26-year-old Indonesian, neutral accent, articulate product-knowledgeable tone, medium pace, polished delivery',
  },
  {
    id: 'mc-acara',
    label: 'MC acara',
    description: 'Lively energetic female voice, 27-year-old Indonesian, Jakarta accent, animated enthusiastic tone, fast vibrant pace',
  },
  {
    id: 'sales-friendly',
    label: 'Sales friendly',
    description: 'Warm persuasive female voice, 28-year-old Indonesian, neutral accent, confident yet approachable tone, medium pace, trust-building delivery',
  },
  {
    id: 'host-podcast-wanita',
    label: 'Host podcast',
    description: 'Smooth conversational female voice, 29-year-old Indonesian, neutral accent, casual articulate tone, natural pace with thoughtful pauses',
  },
  {
    id: 'wanita-karir',
    label: 'Wanita karir',
    description: 'Confident professional female voice, 30-year-old Indonesian, neutral accent, articulate poised tone, medium pace',
  },
  {
    id: 'ibu-muda-ramah',
    label: 'Ibu muda ramah',
    description: 'Warm caring female voice, 32-year-old Indonesian, soft genuine tone, slight smile in voice, medium pace, approachable and trustworthy',
  },
];
```

## Risks

| Risk | Mitigation |
|---|---|
| Voice tidak 100% konsisten antar scene | Tulis deskripsi sangat detail (umur + timbre + aksen + mood + pace). Generate dalam 1 batch waktu yang sama. Re-generate scene yang off (cost Rp 3.945/clip). |
| Veo drift ke aksen asing untuk Bahasa Indonesia | Selalu sebut "Indonesian" + aksen spesifik (Jakarta/Javanese/Sundanese) di deskripsi |
| Dialog panjang per scene → lip-sync kacau | Pecah scene jadi pendek (~1 kalimat per scene 8 detik). Sudah sesuai struktur SCENE_TYPES (Hook/Problem/Solution/CTA). |
| User isi `voiceProfile` tapi scene tanpa talent | Veo akan abaikan karena tidak ada character on-camera. Tidak ada side effect. |

## Test Plan

1. **Backward compatibility**: jalankan generation tanpa `voiceProfile` → harus lolos seperti biasa
2. **Custom voice**: upload model + isi voice profile detail → generate 5 scene → verifikasi voice match deskripsi
3. **Preset**: pilih preset "Pria muda energik" → generate → verifikasi voice cocok preset
4. **Konsistensi**: bandingkan 5 scene dari 1 generation → voice harus mirip antar scene
5. **Bahasa Indonesia**: verifikasi tidak slip ke aksen asing untuk preset Indonesian

## Out of Scope

- Voice cloning (butuh ElevenLabs/Cartesia)
- Talent library reusable
- Audio post-processing
- Voice preview sebelum generate (butuh API TTS terpisah)
- Multi-talent per scene dengan voice berbeda (butuh enrichVisualPrompts redesign)

## Estimasi

| Item | File | Baris |
|---|---|---|
| Schema | types.ts | ~5 |
| Prompt template | prompts.ts | ~15 |
| LLM layer | llm/index.ts | ~3 |
| API route | api/generations/route.ts | ~3 |
| Worker | runGeneration.ts | ~3 |
| API directors-script | api/generate-directors-script/route.ts | ~3 |
| API studio veo-prompts | api/studio/generate-veo-prompts/route.ts | ~3 |
| UI form | InputForm.tsx + studio/page.tsx | ~30 |
| Voice presets | voicePresets.ts (baru) | ~50 |
| **Total** | **9 file (1 baru)** | **~115 baris** |

## Open Questions

1. Apakah preset library sudah cukup 10? Atau perlu lebih (misal 20+)?
2. Apakah voice profile ditampilkan juga saat user view existing generation (read-only)?
3. Apakah field ini perlu masuk juga ke layer L0 vision describe (extract voice cue dari foto)?
