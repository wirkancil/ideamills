# Studio Video Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit first-frame picker (model/product) + Veo model picker (fast/quality) to Studio "Punya Aset", send second photo as `referenceImage_1` (R2V), reorganize form into 1-page numbered sections, and fix Studio→Video auto-trigger regression.

**Architecture:** 5 files modified, 0 files created, 0 DB migration (additive fields). UI: AssetsForm gets Section 3 (Pengaturan Video) with 2 dropdowns + warning. Backend: studio/create persists `first_frame` + `veo_model` to Generation, generate-videos resolves startImage + reference at runtime from generation-level photos. useapi.ts createVideoJob accepts `referenceImageUrls` for R2V. handleSubmit auto-chains create → veo prompts → generate-videos.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind + shadcn/ui (`Select` already exists), useapi.net Veo API.

**Spec:** [docs/superpowers/specs/2026-04-29-studio-video-settings-design.md](../specs/2026-04-29-studio-video-settings-design.md)

**Note on testing:** No automated tests. Per task: typecheck via `npx tsc --noEmit` (NOT `npm run build` while dev server running) + manual smoke verification. Full E2E test at end.

**Note on language:** UI copy Bahasa Indonesia.

---

## File Structure

**Files modified (5), no new files:**

```
app/lib/types.ts                                  # +first_frame, +veo_model on DBGeneration
app/lib/useapi.ts                                 # createVideoJob accepts referenceImageUrls
app/api/studio/create/route.ts                    # Validate + persist new fields; drop scene.generated_image_path = product default
app/api/generations/[id]/generate-videos/route.ts # Filter changed; resolve images per scene from generation-level photos
app/studio/page.tsx                               # AssetsForm: Section 3 + validation + auto-trigger
```

---

## Task 1: Add Type Fields

**Files:**
- Modify: `app/lib/types.ts`

Add 2 fields to `DBGeneration` interface. Additive (optional fields — backward compat with legacy generations).

- [ ] **Step 1: Update DBGeneration**

Open `app/lib/types.ts`. Find the `DBGeneration` interface (around lines 99-115). Currently:

```typescript
export interface DBGeneration {
  _id: string;
  idempotency_key?: string;
  product_identifier: string;
  model_identifier?: string;
  creative_idea_title?: string;
  product_image_url?: string;
  model_image_url?: string | null;
  overrides?: string | null;
  modelConfig?: Record<string, unknown>;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
  progress: number;
  progress_label?: string;
  error_message?: string | null;
  created_at: Date;
  updated_at: Date;
}
```

Add 2 fields before `created_at`:

```typescript
export interface DBGeneration {
  _id: string;
  idempotency_key?: string;
  product_identifier: string;
  model_identifier?: string;
  creative_idea_title?: string;
  product_image_url?: string;
  model_image_url?: string | null;
  overrides?: string | null;
  modelConfig?: Record<string, unknown>;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
  progress: number;
  progress_label?: string;
  error_message?: string | null;
  first_frame?: 'model' | 'product';
  veo_model?: 'veo-3.1-fast' | 'veo-3.1-quality';
  created_at: Date;
  updated_at: Date;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/types.ts
git commit -m "feat(studio): add first_frame and veo_model fields to DBGeneration"
```

---

## Task 2: Update `useapi.ts` to Support Reference Images

**Files:**
- Modify: `app/lib/useapi.ts`

Update `VideoGenerateOptions` interface and `createVideoJob` function to accept up to 3 reference image media IDs and send them as `referenceImage_1..3` in the Veo request.

- [ ] **Step 1: Replace `VideoGenerateOptions` interface**

Open `app/lib/useapi.ts`. Find the existing `VideoGenerateOptions` interface (around lines 9-15):

```typescript
export interface VideoGenerateOptions {
  imageUrl: string;             // mediaGenerationId from uploadImageAsset()
  prompt: string;
  aspectRatio?: 'landscape' | 'portrait';
  model?: string;
  email?: string;
}
```

Replace with:

```typescript
export interface VideoGenerateOptions {
  imageUrl: string;             // mediaGenerationId from uploadImageAsset(), used as startImage
  prompt: string;
  aspectRatio?: 'landscape' | 'portrait';
  model?: string;
  email?: string;
  referenceImageUrls?: string[]; // 0–3 mediaGenerationIds, mapped to referenceImage_1..3
}
```

- [ ] **Step 2: Update `createVideoJob` body construction**

In the same file, find the `createVideoJob` function (around lines 80-95). Currently:

```typescript
export async function createVideoJob(opts: VideoGenerateOptions): Promise<string> {
  const userEmail = opts.email ?? process.env.USEAPI_GOOGLE_EMAIL;
  if (!userEmail) throw new Error('USEAPI_GOOGLE_EMAIL not set');

  const result = await jsonRequest<{ jobid: string }>(
    'POST',
    '/google-flow/videos',
    {
      email: userEmail,
      prompt: opts.prompt,
      model: opts.model ?? 'veo-3.1-fast',
      aspectRatio: opts.aspectRatio ?? 'landscape',
      startImage: opts.imageUrl,
      async: true,
    }
  );
  return result.jobid;
}
```

Replace with:

```typescript
export async function createVideoJob(opts: VideoGenerateOptions): Promise<string> {
  const userEmail = opts.email ?? process.env.USEAPI_GOOGLE_EMAIL;
  if (!userEmail) throw new Error('USEAPI_GOOGLE_EMAIL not set');

  const refs = opts.referenceImageUrls ?? [];
  const referenceFields: Record<string, string> = {};
  if (refs[0]) referenceFields.referenceImage_1 = refs[0];
  if (refs[1]) referenceFields.referenceImage_2 = refs[1];
  if (refs[2]) referenceFields.referenceImage_3 = refs[2];

  const result = await jsonRequest<{ jobid: string }>(
    'POST',
    '/google-flow/videos',
    {
      email: userEmail,
      prompt: opts.prompt,
      model: opts.model ?? 'veo-3.1-fast',
      aspectRatio: opts.aspectRatio ?? 'landscape',
      startImage: opts.imageUrl,
      async: true,
      ...referenceFields,
    }
  );
  return result.jobid;
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/useapi.ts
git commit -m "feat(studio): support referenceImage_1..3 in createVideoJob (R2V)"
```

---

## Task 3: Update `studio/create` to Persist Settings

**Files:**
- Modify: `app/api/studio/create/route.ts`

Three changes:
1. Add `first_frame` + `veo_model` to request schema (required, validated).
2. Persist them to Generation document.
3. Remove the default `imagePath = storedProductUrl` for scenes (let `generated_image_path` stay null when user doesn't upload per-scene image).

- [ ] **Step 1: Update request schema**

Open `app/api/studio/create/route.ts`. Find `StudioCreateSchema` (lines 15-21):

```typescript
const StudioCreateSchema = z.object({
  productImageUrl: z.string().min(1),
  modelImageUrl: z.string().nullable().optional(),
  brief: z.string().optional().default(''),
  scenes: z.array(SceneInputSchema).optional(),
  modelConfig: z.record(z.unknown()).optional(),
});
```

Replace with:

```typescript
const StudioCreateSchema = z.object({
  productImageUrl: z.string().min(1),
  modelImageUrl: z.string().nullable().optional(),
  brief: z.string().optional().default(''),
  scenes: z.array(SceneInputSchema).optional(),
  modelConfig: z.record(z.unknown()).optional(),
  first_frame: z.enum(['model', 'product']),
  veo_model: z.enum(['veo-3.1-fast', 'veo-3.1-quality']),
});
```

- [ ] **Step 2: Add cross-field validation (model image required if first_frame === 'model')**

Right after `const { productImageUrl, modelImageUrl, brief, scenes, modelConfig } = validation.data;` line (around line 33), update destructure and add validation:

Find:

```typescript
    const { productImageUrl, modelImageUrl, brief, scenes, modelConfig } = validation.data;
```

Replace with:

```typescript
    const { productImageUrl, modelImageUrl, brief, scenes, modelConfig, first_frame, veo_model } = validation.data;

    if (first_frame === 'model' && (!modelImageUrl || modelImageUrl.length === 0)) {
      return NextResponse.json(
        { error: 'Foto model wajib diisi kalau dipilih sebagai first frame' },
        { status: 400 }
      );
    }
```

- [ ] **Step 3: Add fields to Generation insert**

Find the `db.collection('Generations').insertOne({...})` block (around lines 68-85). Add `first_frame` and `veo_model` before `created_at`:

Current end of insertOne object:

```typescript
      needs_veo_prompt: !hasVeoPrompts,
      created_at: now,
      updated_at: now,
    });
```

Replace with:

```typescript
      needs_veo_prompt: !hasVeoPrompts,
      first_frame,
      veo_model,
      created_at: now,
      updated_at: now,
    });
```

- [ ] **Step 4: Remove default scene image = product**

Find the per-scene image handling block (around lines 99-119) inside the `sceneInputs.map(...)`:

```typescript
        if (s.imageDataUrl) {
          try {
            imagePath = await saveImage(s.imageDataUrl, generationIdStr, `scene-${idx}.jpg`);
            imageStatus = 'done';
            imageSource = 'user';
          } catch {
            imageStatus = 'failed';
          }
        } else if (storedProductUrl) {
          // Default: use product image as scene image
          imagePath = storedProductUrl;
          imageStatus = 'done';
          imageSource = 'user';
        }
```

Replace with (drop the `else if` branch):

```typescript
        if (s.imageDataUrl) {
          try {
            imagePath = await saveImage(s.imageDataUrl, generationIdStr, `scene-${idx}.jpg`);
            imageStatus = 'done';
            imageSource = 'user';
          } catch {
            imageStatus = 'failed';
          }
        }
        // No default to product anymore — generate-videos resolves from generation.first_frame at runtime
```

- [ ] **Step 5: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/studio/create/route.ts
git commit -m "feat(studio): persist first_frame and veo_model; drop scene.generated_image_path = product default"
```

---

## Task 4: Update `generate-videos` to Resolve Images at Runtime

**Files:**
- Modify: `app/api/generations/[id]/generate-videos/route.ts`

Three changes:
1. Drop `generated_image_path` from scene filter (only require `image_to_video`).
2. Pass `generation` doc into background processing so it can read `first_frame` + `veo_model`.
3. Per scene, resolve startImage + reference image from generation-level photos when scene.generated_image_path is null. Pass `model` + `referenceImageUrls` to createVideoJob.

- [ ] **Step 1: Update scene filter**

Open `app/api/generations/[id]/generate-videos/route.ts`. Find the scene filter block (around lines 33-37):

```typescript
  // Build filter: scenes that have an image (generated or user-uploaded) + have vid prompt
  const sceneFilter: Record<string, unknown> = {
    generated_image_path: { $exists: true, $ne: '' },
    image_to_video: { $exists: true, $ne: '' },
  };
```

Replace with (drop generated_image_path requirement):

```typescript
  // Build filter: scenes that have a video prompt (image resolved from generation level at runtime)
  const sceneFilter: Record<string, unknown> = {
    image_to_video: { $exists: true, $ne: '' },
  };
```

- [ ] **Step 2: Pass `generation` doc to background processing**

Find the background trigger line (around line 58):

```typescript
  generateVideosBackground(db, id, scenes).catch((err) => {
    console.error('[generate-videos] background error:', err);
  });
```

Replace with:

```typescript
  generateVideosBackground(db, id, scenes, generation).catch((err) => {
    console.error('[generate-videos] background error:', err);
  });
```

Then update the function signature. Find:

```typescript
async function generateVideosBackground(
  db: Awaited<ReturnType<typeof import('@/app/lib/mongoClient').getDb>>,
  genId: string,
  scenes: any[]
) {
```

Replace with:

```typescript
async function generateVideosBackground(
  db: Awaited<ReturnType<typeof import('@/app/lib/mongoClient').getDb>>,
  genId: string,
  scenes: any[],
  generation: any
) {
```

- [ ] **Step 3: Replace per-scene processing logic**

Find the inner async block inside `Promise.allSettled(scenes.map((scene) => limit(async () => {...})))` (around lines 75-99). Currently:

```typescript
      limit(async () => {
        const sceneId = scene._id.toString();
        try {
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { video_status: 'generating', updated_at: new Date() } }
          );
          const imageBase64 = await loadImageAsDataUrl(scene.generated_image_path);
          const mediaId = await uploadImageAsset(imageBase64);
          const jobId = await createVideoJob({ imageUrl: mediaId, prompt: scene.image_to_video });
          const videoUrl = await waitForVideo(jobId);
          const videoPath = await downloadAndSaveVideo(videoUrl, genId, `${sceneId}.mp4`);
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { generated_video_path: videoPath, video_status: 'done', updated_at: new Date() } }
          );
        } catch (err) {
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { video_status: 'failed', video_error: (err as Error).message, updated_at: new Date() } }
          );
        }
      })
```

Replace with (resolve images from generation-level + send reference image):

```typescript
      limit(async () => {
        const sceneId = scene._id.toString();
        try {
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { video_status: 'generating', updated_at: new Date() } }
          );

          // Resolve first frame + reference image
          const firstFrameChoice: 'model' | 'product' = generation.first_frame ?? 'product';
          const veoModel: string = generation.veo_model ?? 'veo-3.1-fast';
          const supportsR2V = veoModel !== 'veo-3.1-quality';

          let firstFrameImagePath: string | null = null;
          let referenceImagePath: string | null = null;

          if (scene.generated_image_path) {
            // Per-scene custom image overrides generation-level setting
            firstFrameImagePath = scene.generated_image_path;
          } else {
            firstFrameImagePath = (firstFrameChoice === 'model')
              ? (generation.model_image_url ?? null)
              : (generation.product_image_url ?? null);
            referenceImagePath = (firstFrameChoice === 'model')
              ? (generation.product_image_url ?? null)
              : (generation.model_image_url ?? null);
          }

          if (!firstFrameImagePath) {
            throw new Error(`Tidak ada image untuk first frame (${firstFrameChoice})`);
          }

          // Upload first frame
          const firstFrameBase64 = await loadImageAsDataUrl(firstFrameImagePath);
          const startImageId = await uploadImageAsset(firstFrameBase64);

          // Upload reference image if Veo model supports R2V
          const referenceImageIds: string[] = [];
          if (supportsR2V && referenceImagePath) {
            const refBase64 = await loadImageAsDataUrl(referenceImagePath);
            const refId = await uploadImageAsset(refBase64);
            referenceImageIds.push(refId);
          }

          const jobId = await createVideoJob({
            imageUrl: startImageId,
            referenceImageUrls: referenceImageIds.length > 0 ? referenceImageIds : undefined,
            prompt: scene.image_to_video,
            model: veoModel,
          });
          const videoUrl = await waitForVideo(jobId);
          const videoPath = await downloadAndSaveVideo(videoUrl, genId, `${sceneId}.mp4`);
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { generated_video_path: videoPath, video_status: 'done', updated_at: new Date() } }
          );
        } catch (err) {
          await db.collection('Scenes').updateOne(
            { _id: scene._id },
            { $set: { video_status: 'failed', video_error: (err as Error).message, updated_at: new Date() } }
          );
        }
      })
```

- [ ] **Step 4: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/generations/[id]/generate-videos/route.ts
git commit -m "feat(studio): resolve startImage + referenceImage from generation settings"
```

---

## Task 5: Update Studio AssetsForm UI (Section 3 + Validation + Auto-Trigger)

**Files:**
- Modify: `app/studio/page.tsx`

Major UI changes to `AssetsForm`:
1. Add 2 state hooks: `firstFrame`, `veoModel`.
2. Add Section 3 UI with 2 dropdowns + conditional warning.
3. Update validation in handleSubmit (4 conditions).
4. Update body sent to `/api/studio/create` to include new fields.
5. Auto-trigger `/api/generations/[id]/generate-videos` after create (regression fix).
6. Remove `?tab=assets` from final redirect (read-only Riwayat doesn't use tabs).

- [ ] **Step 1: Add state hooks for firstFrame and veoModel**

Open `app/studio/page.tsx`. Find the `AssetsForm` function. Inside it, near the top where existing useState calls live (around line 289-301), find:

```typescript
function AssetsForm({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [productDataUrl, setProductDataUrl] = useState<string | null>(null);
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const [modelDataUrl, setModelDataUrl] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [scenes, setScenes] = useState<SceneInput[]>([newScene()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productFileRef = useRef<HTMLInputElement>(null);
  const modelFileRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importedScriptTitle, setImportedScriptTitle] = useState<string | null>(null);
```

Add 2 new state lines after `importedScriptTitle`:

```typescript
  const [firstFrame, setFirstFrame] = useState<'' | 'model' | 'product'>('');
  const [veoModel, setVeoModel] = useState<'' | 'veo-3.1-fast' | 'veo-3.1-quality'>('');
```

- [ ] **Step 2: Add Select component import**

Find the existing imports at the top of the file. Find:

```typescript
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
```

Add Select import after Textarea:

```typescript
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
```

- [ ] **Step 3: Replace handleSubmit with new validation + auto-trigger**

Find the `handleSubmit` function in `AssetsForm` (around lines 314-353):

```typescript
  async function handleSubmit() {
    if (!productDataUrl) { setError('Upload foto produk dulu.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const hasContent = scenes.some((s) => s.narasi.trim() || s.imageDataUrl);
      const res = await fetch('/api/studio/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImageUrl: productDataUrl,
          modelImageUrl: modelDataUrl,
          brief,
          scenes: hasContent
            ? scenes.map((s) => ({
                struktur: 'Scene',
                naskah_vo: s.narasi,
                text_to_image: '',
                image_to_video: s.narasi,
                imageDataUrl: s.imageDataUrl,
              }))
            : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Gagal membuat video');
      const { generationId, needsVeoPrompt } = await res.json();

      if (needsVeoPrompt) {
        await fetch('/api/studio/generate-veo-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generationId }),
        });
      }
      router.push(`/generations/${generationId}?tab=assets`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
      setSubmitting(false);
    }
  }
```

Replace with:

```typescript
  async function handleSubmit() {
    if (!productDataUrl) { setError('Upload foto produk dulu.'); return; }
    if (!firstFrame) { setError('Pilih foto first frame.'); return; }
    if (!veoModel) { setError('Pilih Veo model.'); return; }
    if (firstFrame === 'model' && !modelDataUrl) {
      setError('Foto model wajib diisi kalau dipilih sebagai first frame.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const hasContent = scenes.some((s) => s.narasi.trim() || s.imageDataUrl);
      const createRes = await fetch('/api/studio/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImageUrl: productDataUrl,
          modelImageUrl: modelDataUrl,
          brief,
          first_frame: firstFrame,
          veo_model: veoModel,
          scenes: hasContent
            ? scenes.map((s) => ({
                struktur: 'Scene',
                naskah_vo: s.narasi,
                text_to_image: '',
                image_to_video: s.narasi,
                imageDataUrl: s.imageDataUrl,
              }))
            : undefined,
        }),
      });
      if (!createRes.ok) throw new Error((await createRes.json()).error || 'Gagal membuat video');
      const { generationId, needsVeoPrompt } = await createRes.json();

      if (needsVeoPrompt) {
        await fetch('/api/studio/generate-veo-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generationId }),
        });
      }

      // Auto-trigger video generation (regression fix — Riwayat detail is read-only)
      await fetch(`/api/generations/${generationId}/generate-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      router.push(`/generations/${generationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
      setSubmitting(false);
    }
  }
```

- [ ] **Step 4: Add Section 3 UI before "Buat Video" button**

In the `AssetsForm` JSX, find the section right before the "Buat Video" button. The structure currently looks like:

```tsx
        {error && <ErrorBox message={error} />}

        <Button size="lg" className="w-full text-base" disabled={submitting || !productDataUrl} onClick={handleSubmit}>
```

Insert Section 3 (Pengaturan Video) BEFORE `{error && ...}` line. The full replacement:

```tsx
        {/* Section 3: Pengaturan Video */}
        <div className="space-y-4 pt-2 border-t">
          <div>
            <Label className="text-base font-semibold">3️⃣ Pengaturan Video</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Pilih foto first frame dan kualitas video.</p>
          </div>

          <div className="space-y-2">
            <Label>
              Foto first frame <span className="text-destructive">*</span>
            </Label>
            <Select value={firstFrame} onValueChange={(v) => setFirstFrame(v as 'model' | 'product')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih dulu..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="model">Foto Model</SelectItem>
                <SelectItem value="product">Foto Produk</SelectItem>
              </SelectContent>
            </Select>
            {firstFrame === 'model' && !modelDataUrl && (
              <p className="text-xs text-destructive">⚠ Foto model belum di-upload — wajib jika first frame = Foto Model</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Veo Model <span className="text-destructive">*</span>
            </Label>
            <Select value={veoModel} onValueChange={(v) => setVeoModel(v as 'veo-3.1-fast' | 'veo-3.1-quality')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih dulu..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="veo-3.1-fast">Fast — $0.05/video, support reference image</SelectItem>
                <SelectItem value="veo-3.1-quality">Quality — $0.50/video, premium (no reference image)</SelectItem>
              </SelectContent>
            </Select>
            {veoModel === 'veo-3.1-quality' && (
              <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
                ⚠️ Veo Quality tidak support reference image. Foto yang bukan first frame tidak akan dipakai sebagai referensi.
              </div>
            )}
          </div>
        </div>

        {error && <ErrorBox message={error} />}

        <Button size="lg" className="w-full text-base" disabled={submitting || !productDataUrl} onClick={handleSubmit}>
```

- [ ] **Step 5: Tighten button disabled logic**

The current `disabled` prop is `submitting || !productDataUrl`. Update it to disable when any required field is missing.

Find:

```tsx
        <Button size="lg" className="w-full text-base" disabled={submitting || !productDataUrl} onClick={handleSubmit}>
```

Replace with:

```tsx
        <Button
          size="lg"
          className="w-full text-base"
          disabled={
            submitting ||
            !productDataUrl ||
            !firstFrame ||
            !veoModel ||
            (firstFrame === 'model' && !modelDataUrl)
          }
          onClick={handleSubmit}
        >
```

- [ ] **Step 6: Update helper text below button**

Find the existing helper text (right after closing `</Button>`):

```tsx
        {!productDataUrl && <p className="text-xs text-muted-foreground text-center -mt-2">Upload foto produk untuk mulai.</p>}
```

Replace with a more comprehensive helper:

```tsx
        {(!productDataUrl || !firstFrame || !veoModel || (firstFrame === 'model' && !modelDataUrl)) && (
          <p className="text-xs text-muted-foreground text-center -mt-2">
            Lengkapi field bertanda <span className="text-destructive">*</span> untuk lanjut.
          </p>
        )}
```

- [ ] **Step 7: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/studio/page.tsx
git commit -m "feat(studio): add Section 3 (Pengaturan Video) with first_frame + veo_model pickers; auto-trigger video gen"
```

---

## Task 6: Manual Smoke Test

**Files:** none modified — verification only.

Walk through the manual test plan from the spec to verify the new Studio flow end-to-end.

- [ ] **Step 1: Ensure dev server is fresh**

If dev server has stale `.next/` from `npm run build` (we learned earlier this corrupts dev cache), restart cleanly:

```bash
ps aux | grep -E "next dev|next-server" | grep -v grep | awk '{print $2}' | xargs kill 2>/dev/null
rm -rf .next
npm run dev &
sleep 6
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000
```

Expected: `HTTP 307` (redirect from /).

Verify MongoDB is up:

```bash
lsof -i :27017 | head -3
```

Expected: a `mongod` process listening on 27017.

- [ ] **Step 2: Validation walkthrough**

Open browser to `http://localhost:3000/studio`. Click "Punya Aset".

- [ ] Form opens with 3 sections visible: 1️⃣ Foto, 2️⃣ Prompt, 3️⃣ Pengaturan Video
- [ ] "Buat Video" button initially disabled. Helper text below: "Lengkapi field bertanda * untuk lanjut."
- [ ] Upload only foto produk → button still disabled
- [ ] Pick `Foto Model` from first_frame dropdown without uploading model → red helper text appears: "⚠ Foto model belum di-upload..."
- [ ] Upload foto model → red helper text disappears
- [ ] Pick `Quality` from Veo dropdown → amber warning box appears about reference image
- [ ] Pick `Fast` → warning disappears
- [ ] Once all 4 conditions met (productDataUrl, modelDataUrl conditional, firstFrame, veoModel) → button enabled

- [ ] **Step 3: Functional Test A — first_frame=model + veo=fast**

- [ ] Upload foto model + foto produk (any test images)
- [ ] Type a prompt in Scene 1 narasi (e.g., paste short prompt)
- [ ] Pick `Foto Model` + `Fast`
- [ ] Click "Buat Video"
- [ ] Browser redirects to `/generations/[id]` (no `?tab=assets`)
- [ ] Page shows "Sedang memproses pipeline" with progress bar
- [ ] Wait ~90 seconds (auto-poll every 5s)
- [ ] Page transitions to read-only success view: scene card with image preview + video player
- [ ] **Verify in browser dev tools Network tab:** background `/generate-videos` was triggered automatically (no manual click needed)
- [ ] **Verify the resulting video:** model is in first frame, product appears as reference (if Fast supports R2V)

- [ ] **Step 4: Functional Test B — first_frame=product + veo=fast**

- [ ] Click "Kembali" or open new Studio session
- [ ] Repeat upload + prompt
- [ ] Pick `Foto Produk` + `Fast`
- [ ] Click "Buat Video" → redirect → wait ~90s
- [ ] Verify video: product in first frame, model as reference

- [ ] **Step 5: Functional Test C — Quality model**

- [ ] New Studio session, upload model + product
- [ ] Pick `Foto Model` + `Quality`
- [ ] Verify amber warning visible
- [ ] Click "Buat Video" → wait (Quality may take longer)
- [ ] Verify video: only model is first frame, no reference image used (product not in video unless prompted)

- [ ] **Step 6: DB inspection (optional but informative)**

In MongoDB Compass or shell:

```javascript
db.Generations.findOne({}, { sort: { created_at: -1 } });
```

Expected: latest doc has `first_frame` (`'model'` or `'product'`) and `veo_model` (`'veo-3.1-fast'` or `'veo-3.1-quality'`) fields populated.

```javascript
db.Scenes.findOne({ generation_id: '<latest-gen-id>' });
```

Expected: scene has `image_to_video` populated, `generated_image_path` may be `null` (resolved at generate-videos runtime).

- [ ] **Step 7: Production readiness checklist**

- [ ] No console.error in browser DevTools while navigating Studio → /generations/[id]
- [ ] No 500 errors in dev server log during `/api/studio/create` or `/api/generations/[id]/generate-videos`
- [ ] Videos generated successfully save to `storage/videos/{genId}/{sceneId}.mp4`
- [ ] All Bahasa Indonesia copy correct (no English leak)

- [ ] **Step 8: Final commit (if any small fixes during verification)**

If any small fixes needed during walkthrough:

```bash
git add <changed-files>
git commit -m "fix(studio): <description>"
```

Otherwise no commit needed.

Suggested PR title:

```
feat(studio): add first_frame + veo_model pickers; fix Studio→Video auto-trigger
```

---

## Summary

After completing all 6 tasks:
- **Files modified:** 5 (types.ts, useapi.ts, studio/create, generate-videos, studio/page.tsx)
- **No new files. No deletions. No DB migration** (additive optional fields only)
- **Behavior changes:**
  - Studio Punya Aset now has 3 numbered sections + 2 required pickers
  - Submit button disabled until all required fields filled
  - On submit: create generation → optionally generate-veo-prompts → auto-trigger generate-videos → redirect to read-only Riwayat detail (no manual button click)
  - Backend resolves first frame photo from `generation.first_frame` setting at video generation time (no longer defaults scene image to product)
  - Second photo automatically becomes `referenceImage_1` (R2V) when Veo model supports it (Fast yes, Quality no)
- **No new deps**

Spec compliance verified against `docs/superpowers/specs/2026-04-29-studio-video-settings-design.md`.
