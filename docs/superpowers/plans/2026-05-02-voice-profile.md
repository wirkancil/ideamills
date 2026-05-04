# Voice Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User bisa pilih voice profile di setup awal Studio, dan deskripsi voice dikirim ke Veo di setiap clip prompt agar suara model konsisten antar clip.

**Architecture:** VoiceProfilePicker component (dropdown preset + textarea custom) ditampilkan di setup awal Studio setelah StudioInput. State `voiceProfile` di-pass ke generate API, disimpan ke MongoDB `voice_profile` field, lalu dibaca worker dan di-prepend ke `finalVeoPrompt` dan `finalPrompt` (extend chain) sebagai audio direction.

**Tech Stack:** Next.js, React, TypeScript, MongoDB, Tailwind CSS.

---

## File Structure

- Create: `app/lib/voicePresets.ts` — 10 preset voice profile
- Create: `app/studio/components/VoiceProfilePicker.tsx` — dropdown + textarea UI
- Modify: `app/studio/page.tsx` — tambah state + render VoiceProfilePicker + pass ke API calls
- Modify: `app/api/studio/generate/route.ts` — terima voiceProfile, save ke DB
- Modify: `worker/runGeneration.ts` — baca voice_profile dari DB, inject ke finalVeoPrompt

---

### Task 1: Voice presets library

**Files:**
- Create: `app/lib/voicePresets.ts`

- [ ] **Step 1: Buat file voicePresets.ts**

```typescript
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
    id: 'host-podcast',
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

- [ ] **Step 2: Commit**

```bash
git add app/lib/voicePresets.ts
git commit -m "feat: voice presets library"
```

---

### Task 2: VoiceProfilePicker component

**Files:**
- Create: `app/studio/components/VoiceProfilePicker.tsx`

- [ ] **Step 1: Buat component**

```typescript
'use client';

import { VOICE_PRESETS } from '@/app/lib/voicePresets';

interface VoiceProfilePickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function VoiceProfilePicker({ value, onChange }: VoiceProfilePickerProps) {
  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = VOICE_PRESETS.find((p) => p.id === e.target.value);
    if (preset) onChange(preset.description);
    else onChange('');
  };

  const selectedPresetId = VOICE_PRESETS.find((p) => p.description === value)?.id ?? '';

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Voice Profile</label>
      <select
        value={selectedPresetId}
        onChange={handlePresetChange}
        className="w-full text-sm border rounded-lg px-3 py-2 bg-background"
      >
        <option value="">— Pilih preset atau tulis sendiri —</option>
        {VOICE_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Contoh: warm caring female voice, 32-year-old Indonesian, soft genuine tone, medium pace"
        maxLength={500}
        rows={2}
        className="w-full text-xs border rounded-lg px-3 py-2 bg-background resize-none placeholder:text-muted-foreground"
      />
      <p className="text-[10px] text-muted-foreground text-right">{value.length} / 500</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/studio/components/VoiceProfilePicker.tsx
git commit -m "feat: VoiceProfilePicker component"
```

---

### Task 3: Integrasikan VoiceProfilePicker ke Studio page

**Files:**
- Modify: `app/studio/page.tsx`

- [ ] **Step 1: Tambah import VoiceProfilePicker**

Di bagian import atas file, tambahkan:

```typescript
import { VoiceProfilePicker } from './components/VoiceProfilePicker';
```

- [ ] **Step 2: Tambah state voiceProfile**

Di blok state (sekitar line 48, setelah `const [styleNotes, setStyleNotes] = useState('');`):

```typescript
const [voiceProfile, setVoiceProfile] = useState('');
```

- [ ] **Step 3: Pass voiceProfile ke handleSubmitVideo**

Di `handleSubmitVideo` (sekitar line 163), di dalam `JSON.stringify({...})`, tambahkan `voiceProfile`:

```typescript
body: JSON.stringify({
  generationId,
  productNotes,
  styleNotes,
  voiceProfile,
  clips: clips.map((c) => ({
    index: c.index,
    prompt: c.prompt,
    imageMode: c.imageMode,
    imageDataUrl:
      c.imageMode === 'override' || c.imageMode === 'ai-generate'
        ? c.imageDataUrl
        : null,
  })),
}),
```

- [ ] **Step 4: Render VoiceProfilePicker di form setup**

Setelah `<StudioInput ... />` (sekitar line 319) dan sebelum `<EnginePicker ... />`, tambahkan:

```tsx
<VoiceProfilePicker value={voiceProfile} onChange={setVoiceProfile} />
```

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit
```

Expected: tidak ada error.

- [ ] **Step 6: Commit**

```bash
git add app/studio/page.tsx
git commit -m "feat: tambah voice profile picker di setup awal Studio"
```

---

### Task 4: Generate API — terima dan simpan voiceProfile

**Files:**
- Modify: `app/api/studio/generate/route.ts`

- [ ] **Step 1: Tambah voiceProfile ke RequestSchema**

Di `RequestSchema` (sekitar line 22):

```typescript
const RequestSchema = z.object({
  generationId: z.string().min(1),
  productNotes: z.string().max(2000).default(''),
  styleNotes: z.string().max(2000).default(''),
  voiceProfile: z.string().max(500).default(''),
  clips: z.array(ClipDraftSchema).min(1).max(6),
});
```

- [ ] **Step 2: Destructure voiceProfile dan save ke DB**

Di line 40, update destructure:

```typescript
const { generationId, productNotes, styleNotes, voiceProfile, clips: clipDrafts } = parsed.data;
```

Di `updateOne` (sekitar line 84), tambahkan `voice_profile` ke `$set`:

```typescript
$set: {
  productNotes,
  styleNotes,
  voice_profile: voiceProfile,
  clips,
  status: 'queued',
  progress: 0,
  progress_label: 'Antrian video',
  updated_at: now,
},
```

- [ ] **Step 3: Build check**

```bash
npx tsc --noEmit
```

Expected: tidak ada error.

- [ ] **Step 4: Commit**

```bash
git add app/api/studio/generate/route.ts
git commit -m "feat: generate API terima dan simpan voice_profile ke DB"
```

---

### Task 5: Worker — inject voice_profile ke Veo prompt

**Files:**
- Modify: `worker/runGeneration.ts`

Voice profile di-prepend sebagai audio direction ke `finalVeoPrompt` (generate normal) dan `finalPrompt` (extend chain). Format: `"Voice: <voiceProfile>\n\n<rest of prompt>"` — pendek, langsung ke point, mudah dibaca Veo.

- [ ] **Step 1: Baca voice_profile dari DB di runV2StudioGeneration**

Di `runV2StudioGeneration` (sekitar line 88, setelah baca `aspectRatio`), tambahkan:

```typescript
const voiceProfile = (gen.voice_profile as string | undefined) ?? '';
```

- [ ] **Step 2: Pass voiceProfile ke generateClipAssets**

Update semua call `generateClipAssets` (ada 2: single regenerate dan full generation loop) agar pass `voiceProfile`:

```typescript
await generateClipAssets(generationId, clip, productImageUrl, styleNotes, veoModel, aspectRatio, voiceProfile);
```

- [ ] **Step 3: Update signature generateClipAssets**

```typescript
async function generateClipAssets(
  generationId: string,
  clip: Clip,
  productImageUrl: string,
  styleNotes: string,
  veoModel: string,
  aspectRatio: 'landscape' | 'portrait',
  voiceProfile: string = '',
) {
```

- [ ] **Step 4: Inject voiceProfile ke finalVeoPrompt di generateClipAssets**

Cari baris (sekitar line 287 di file asli, setelah resolve veoPrompt):

```typescript
const finalVeoPrompt = [styleNotes, veoPrompt].filter(Boolean).join('\n\n');
```

Ganti dengan:

```typescript
const voiceDirection = voiceProfile ? `Voice: ${voiceProfile}` : '';
const finalVeoPrompt = [voiceDirection, styleNotes, veoPrompt].filter(Boolean).join('\n\n');
```

- [ ] **Step 5: Pass voiceProfile ke extendClipAssets**

Update semua call `extendClipAssets` (ada 2: single regenerate dan full generation loop):

```typescript
await extendClipAssets(generationId, clip, prevMediaId, styleNotes, veoModel, voiceProfile);
```

- [ ] **Step 6: Update signature extendClipAssets**

```typescript
async function extendClipAssets(
  generationId: string,
  clip: Clip,
  prevMediaGenerationId: string,
  styleNotes: string,
  veoModel: string,
  voiceProfile: string = '',
) {
```

- [ ] **Step 7: Inject voiceProfile ke finalPrompt di extendClipAssets**

Cari baris di `extendClipAssets`:

```typescript
const finalPrompt = [styleNotes, veoPrompt].filter(Boolean).join('\n\n');
```

Ganti dengan:

```typescript
const voiceDirection = voiceProfile ? `Voice: ${voiceProfile}` : '';
const finalPrompt = [voiceDirection, styleNotes, veoPrompt].filter(Boolean).join('\n\n');
```

- [ ] **Step 8: Build check**

```bash
npx tsc --noEmit
```

Expected: tidak ada error.

- [ ] **Step 9: Commit**

```bash
git add worker/runGeneration.ts
git commit -m "feat: inject voice_profile ke Veo prompt di generate dan extend chain"
```
