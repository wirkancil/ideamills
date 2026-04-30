# Riwayat Detail Read-Only Simplification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `/generations/[id]` (Riwayat detail page) menjadi pure read-only view tanpa tabs, mutation buttons, atau redundant prompt fields. Pisahkan tanggung jawab Studio (action) vs Riwayat (view-only).

**Architecture:** Build 4 new focused components (GenerationView orchestrator + SceneViewCard + DirectorsScriptModal + VariationPicker). Replace 2 large existing components (`ResultsDisplay` 612 lines, `SceneAssetPanel` 542 lines) dengan view-only equivalents. Auto-poll status untuk in-progress. Tidak ada perubahan API atau DB.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind + shadcn/ui (`Dialog`, `Select`, `Button`, `Card`, `Badge` — semua sudah terpasang), `lucide-react` icons.

**Spec:** [docs/superpowers/specs/2026-04-29-history-readonly-simplification-design.md](../specs/2026-04-29-history-readonly-simplification-design.md)

**Note on testing:** IdeaMills tidak punya automated test infra. Per task: typecheck via `npx tsc --noEmit` (TIDAK pakai `npm run build` karena dev server biasanya jalan dan akan konflik dengan `.next/` cache) + manual smoke verification.

**Note on language:** UI copy dalam Bahasa Indonesia konsisten dengan existing IdeaMills.

---

## File Structure

**Files created (4):**

```
app/components/
  VariationPicker.tsx          # Dropdown picker (only for >1 variation)
  DirectorsScriptModal.tsx     # Optional modal for Naskah Lengkap
  SceneViewCard.tsx            # Read-only scene card
  GenerationView.tsx           # Top-level read-only orchestrator
```

**Files modified (1):**

```
app/generations/[id]/page.tsx  # Full rewrite to use GenerationView
```

**Files deleted (2):**

```
app/components/ResultsDisplay.tsx       # Replaced
app/components/SceneAssetPanel.tsx      # Replaced
```

**API & DB:** Tidak ada perubahan.

---

## Task 1: Create `VariationPicker` Component

**Files:**
- Create: `app/components/VariationPicker.tsx`

Smallest, isolated component. Builds dropdown picker for switching variations. Uses shadcn/ui `Select` already in `app/components/ui/select.tsx`.

- [ ] **Step 1: Create the file**

Create `app/components/VariationPicker.tsx`:

```typescript
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import type { Variation } from '@/app/lib/types';

export interface VariationPickerProps {
  variations: Variation[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}

export function VariationPicker({ variations, selectedIdx, onSelect }: VariationPickerProps) {
  if (variations.length <= 1) return null;

  return (
    <Select
      value={String(selectedIdx)}
      onValueChange={(value) => onSelect(parseInt(value, 10))}
    >
      <SelectTrigger className="w-[280px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {variations.map((variation, idx) => (
          <SelectItem key={variation.id} value={String(idx)}>
            Variasi {idx + 1}: {variation.theme}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run from project root:
```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/VariationPicker.tsx
git commit -m "feat(history): add VariationPicker component"
```

---

## Task 2: Create `DirectorsScriptModal` Component

**Files:**
- Create: `app/components/DirectorsScriptModal.tsx`

Modal for displaying Naskah Lengkap (`directors_script`). Uses shadcn `Dialog` already at `app/components/ui/dialog.tsx`.

- [ ] **Step 1: Create the file**

Create `app/components/DirectorsScriptModal.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Copy, Check, ScrollText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';

export interface DirectorsScriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: string;
}

export function DirectorsScriptModal({ open, onOpenChange, script }: DirectorsScriptModalProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail on insecure contexts; ignore silently
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="w-5 h-5" />
            Naskah Lengkap (Director's Script)
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-6 px-6 py-2">
          <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed bg-muted/30 rounded-lg p-4">
            {script}
          </pre>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Tersalin
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy ke Clipboard
              </>
            )}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/DirectorsScriptModal.tsx
git commit -m "feat(history): add DirectorsScriptModal component"
```

---

## Task 3: Create `SceneViewCard` Component

**Files:**
- Create: `app/components/SceneViewCard.tsx`

Read-only scene card displaying image preview + video player + collapsible prompt + download MP4.

- [ ] **Step 1: Create the file**

Create `app/components/SceneViewCard.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Download, ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, Image as ImageIcon, Video } from 'lucide-react';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import type { AssetStatus, SceneAssetState } from '@/app/lib/types';

const STATUS_LABEL: Record<AssetStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Belum', variant: 'outline' },
  queued: { label: 'Antrian', variant: 'secondary' },
  generating: { label: 'Generating', variant: 'secondary' },
  done: { label: 'Selesai', variant: 'default' },
  failed: { label: 'Gagal', variant: 'destructive' },
};

function StatusIcon({ status }: { status: AssetStatus }) {
  if (status === 'generating' || status === 'queued') {
    return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />;
  }
  if (status === 'done') return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  return null;
}

export interface SceneViewCardProps {
  scene: SceneAssetState;
  sceneIdx: number;
}

const PROMPT_PREVIEW_LIMIT = 220;

export function SceneViewCard({ scene, sceneIdx }: SceneViewCardProps) {
  const [promptExpanded, setPromptExpanded] = useState(false);

  const promptText = (scene.image_to_video || scene.naskah_vo || '').trim();
  const hasPrompt = promptText.length > 0;
  const showExpandToggle = promptText.length > PROMPT_PREVIEW_LIMIT;
  const visiblePrompt = promptExpanded || !showExpandToggle
    ? promptText
    : promptText.slice(0, PROMPT_PREVIEW_LIMIT) + '…';

  function handleDownloadVideo() {
    if (!scene.video_url) return;
    const a = document.createElement('a');
    a.href = scene.video_url;
    a.download = `scene-${sceneIdx + 1}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Header: scene title + overall status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{scene.struktur}</Badge>
            <h3 className="font-semibold text-base">Scene {sceneIdx + 1}</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" />
              <StatusIcon status={scene.image_status} />
              <Badge variant={STATUS_LABEL[scene.image_status].variant} className="text-xs">
                {STATUS_LABEL[scene.image_status].label}
              </Badge>
            </span>
            <span className="inline-flex items-center gap-1">
              <Video className="w-3.5 h-3.5" />
              <StatusIcon status={scene.video_status} />
              <Badge variant={STATUS_LABEL[scene.video_status].variant} className="text-xs">
                {STATUS_LABEL[scene.video_status].label}
              </Badge>
            </span>
          </div>
        </div>

        {/* Media: image preview + video player */}
        <div className="flex flex-col sm:flex-row gap-3">
          {scene.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={scene.image_url}
              alt={`Scene ${sceneIdx + 1} image`}
              className="w-full sm:w-48 h-32 sm:h-32 object-cover rounded-lg border bg-muted"
            />
          ) : (
            <div className="w-full sm:w-48 h-32 rounded-lg border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground bg-muted/30">
              Belum ada image
            </div>
          )}
          {scene.video_url ? (
            <video
              src={scene.video_url}
              controls
              preload="metadata"
              className="flex-1 h-48 sm:h-64 rounded-lg border bg-black object-contain"
            />
          ) : (
            <div className="flex-1 h-48 sm:h-64 rounded-lg border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground bg-muted/30">
              Belum ada video
            </div>
          )}
        </div>

        {/* Prompt (collapsible) */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Prompt</p>
          {hasPrompt ? (
            <div className="border rounded-lg p-3 bg-muted/30">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{visiblePrompt}</p>
              {showExpandToggle && (
                <button
                  type="button"
                  onClick={() => setPromptExpanded((v) => !v)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {promptExpanded ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      Sembunyikan
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      Tampilkan lengkap
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Prompt tidak tersedia</p>
          )}
        </div>

        {/* Download MP4 (only when video exists) */}
        {scene.video_url && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadVideo}
            >
              <Download className="w-4 h-4 mr-2" />
              Download MP4
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/SceneViewCard.tsx
git commit -m "feat(history): add SceneViewCard read-only component"
```

---

## Task 4: Create `GenerationView` Orchestrator Component

**Files:**
- Create: `app/components/GenerationView.tsx`

Top-level component: fetches generation + scenes data in parallel, handles all state transitions (loading / in-progress / succeeded / failed / not-found), auto-polls when in-progress, renders header + variation picker + scene list, mounts DirectorsScriptModal.

- [ ] **Step 1: Create the file**

Create `app/components/GenerationView.tsx`:

```typescript
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ScrollText, Download, AlertTriangle, Clapperboard, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Progress } from '@/app/components/ui/progress';
import { VariationPicker } from './VariationPicker';
import { DirectorsScriptModal } from './DirectorsScriptModal';
import { SceneViewCard } from './SceneViewCard';
import type { GenerationStatus, SceneAssetState, Variation } from '@/app/lib/types';

const POLL_INTERVAL_MS = 5000;

export interface GenerationViewProps {
  generationId: string;
}

interface GenerationApiResponse {
  id: string;
  status: GenerationStatus['status'];
  progress: number;
  progressLabel?: string;
  engine?: string;
  error?: string;
  createdAt: string;
  counts?: { themes: number; scripts: number; variations: number };
  themeCounts?: Record<string, number>;
  variations?: Variation[];
  totalVariations?: number;
}

interface ScenesApiResponse {
  scenes: SceneAssetState[];
}

const ACTIVE_STATUSES = new Set<GenerationStatus['status']>(['queued', 'running', 'processing']);

export function GenerationView({ generationId }: GenerationViewProps) {
  const router = useRouter();
  const [generation, setGeneration] = useState<GenerationApiResponse | null>(null);
  const [scenes, setScenes] = useState<SceneAssetState[]>([]);
  const [selectedVariationIdx, setSelectedVariationIdx] = useState(0);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [genRes, scenesRes] = await Promise.all([
        fetch(`/api/generations/${generationId}?page=1&pageSize=20`),
        fetch(`/api/generations/${generationId}/scenes`),
      ]);

      if (genRes.status === 404) {
        setNotFound(true);
        return;
      }

      if (!genRes.ok) {
        const text = await genRes.text();
        setNetworkError(`Error ${genRes.status}: ${text.slice(0, 200)}`);
        return;
      }

      const genData = (await genRes.json()) as GenerationApiResponse;
      setGeneration(genData);

      if (scenesRes.ok) {
        const scenesData = (await scenesRes.json()) as ScenesApiResponse;
        setScenes(scenesData.scenes ?? []);
      } else {
        setScenes([]);
      }

      setNetworkError(null);
    } catch (err) {
      setNetworkError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [generationId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-poll while generation is in progress
  useEffect(() => {
    if (!generation) return;
    const isActive = ACTIVE_STATUSES.has(generation.status);
    if (isActive) {
      pollRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [generation, fetchAll]);

  const variations = generation?.variations ?? [];
  const selectedVariation = variations[selectedVariationIdx] ?? variations[0];

  // Filter scenes for selected variation when multi-variation.
  // Best-effort: match by scriptId. If id format mismatch (variation.id may be
  // synthetic 'var_NNN' while scene.scriptId is ObjectId string), fall back to
  // showing all scenes. This avoids broken empty state for multi-variation users.
  const displayScenes = useMemo(() => {
    if (variations.length <= 1) return scenes;
    if (!selectedVariation) return scenes;
    const filtered = scenes.filter((s) => s.scriptId === selectedVariation.id);
    return filtered.length > 0 ? filtered : scenes;
  }, [scenes, selectedVariation, variations.length]);

  const title = useMemo(() => {
    if (!generation) return 'Memuat...';
    if (selectedVariation?.theme) return selectedVariation.theme;
    if (generation.engine === 'enhanced') return 'Studio Generation';
    return 'Generation';
  }, [generation, selectedVariation]);

  const subtitle = useMemo(() => {
    if (!generation) return '';
    const date = new Date(generation.createdAt).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const sceneCount = displayScenes.length;
    return `${date} • ${sceneCount} scene${sceneCount !== 1 ? '' : ''}${generation.engine ? ` • ${generation.engine}` : ''}`;
  }, [generation, displayScenes]);

  const doneVideos = displayScenes.filter((s) => s.video_status === 'done').length;
  const totalScenes = displayScenes.length;

  function handleBack() {
    router.push('/history');
  }

  function handleGoToStudio() {
    router.push('/studio');
  }

  function handleDownloadAll() {
    window.open(`/api/generations/${generationId}/download?type=all`, '_blank');
  }

  // ─── Render states ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <Button variant="ghost" onClick={handleBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Kembali ke Riwayat
        </Button>
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-muted-foreground">Generation tidak ditemukan.</p>
            <Button onClick={handleBack}>Kembali ke Riwayat</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (networkError && !generation) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <Button variant="ghost" onClick={handleBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Kembali ke Riwayat
        </Button>
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-destructive">{networkError}</p>
            <Button onClick={fetchAll}>Coba Lagi</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!generation) return null;

  const isFailed = generation.status === 'failed' || generation.status === 'canceled';
  const isInProgress = ACTIVE_STATUSES.has(generation.status);
  const isSucceeded = generation.status === 'succeeded' || generation.status === 'partial';

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      <Button variant="ghost" onClick={handleBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Kembali ke Riwayat
      </Button>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{title}</h1>
              {isSucceeded && (
                <Badge variant="default" className="text-xs">
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  Selesai {doneVideos}/{totalScenes} video
                </Badge>
              )}
              {isInProgress && (
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  {generation.progress}%
                </Badge>
              )}
              {isFailed && (
                <Badge variant="destructive" className="text-xs">
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                  Gagal
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {isSucceeded && (doneVideos > 0 || displayScenes.some((s) => s.image_url)) && (
            <Button variant="outline" onClick={handleDownloadAll}>
              <Download className="w-4 h-4 mr-2" />
              Download Semua ZIP
            </Button>
          )}
        </div>

        {/* Variation picker + Naskah Lengkap (only when applicable) */}
        {isSucceeded && (variations.length > 1 || selectedVariation?.directors_script) && (
          <div className="flex items-center gap-3 flex-wrap">
            {variations.length > 1 && (
              <VariationPicker
                variations={variations}
                selectedIdx={selectedVariationIdx}
                onSelect={setSelectedVariationIdx}
              />
            )}
            {selectedVariation?.directors_script && (
              <Button variant="outline" size="sm" onClick={() => setScriptModalOpen(true)}>
                <ScrollText className="w-4 h-4 mr-2" />
                Lihat Naskah Lengkap
              </Button>
            )}
          </div>
        )}
      </div>

      {/* In-progress view */}
      {isInProgress && (
        <Card>
          <CardContent className="py-8 space-y-4">
            <p className="text-sm text-muted-foreground">
              Sedang memproses pipeline. Halaman akan auto-refresh.
            </p>
            <Progress value={generation.progress} />
            {generation.progressLabel && (
              <p className="text-xs text-muted-foreground">{generation.progressLabel}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Failed view */}
      {isFailed && (
        <Card className="border-destructive">
          <CardContent className="py-8 space-y-4 text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <div>
              <p className="font-medium">Generation gagal</p>
              {generation.error && (
                <p className="text-sm text-muted-foreground mt-2">{generation.error}</p>
              )}
            </div>
            <Button onClick={handleGoToStudio}>
              <Clapperboard className="w-4 h-4 mr-2" />
              Buat Ulang di Studio
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Succeeded view: scene list */}
      {isSucceeded && displayScenes.length > 0 && (
        <div className="space-y-3">
          {displayScenes.map((scene, idx) => (
            <SceneViewCard key={scene.id} scene={scene} sceneIdx={idx} />
          ))}
        </div>
      )}

      {/* Empty state when succeeded but no scenes */}
      {isSucceeded && displayScenes.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-muted-foreground">Tidak ada hasil untuk variasi ini.</p>
            <Button variant="outline" onClick={handleGoToStudio}>
              <Clapperboard className="w-4 h-4 mr-2" />
              Buat Generation Baru
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Naskah Lengkap modal */}
      {selectedVariation?.directors_script && (
        <DirectorsScriptModal
          open={scriptModalOpen}
          onOpenChange={setScriptModalOpen}
          script={selectedVariation.directors_script}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/GenerationView.tsx
git commit -m "feat(history): add GenerationView orchestrator component"
```

---

## Task 5: Rewrite `/generations/[id]` Page

**Files:**
- Modify: `app/generations/[id]/page.tsx` (full rewrite)

Replace the existing 261-line page with a thin wrapper that mounts `GenerationView`. All state management, polling, and rendering logic now lives in `GenerationView`.

- [ ] **Step 1: Replace the entire file content**

Open `app/generations/[id]/page.tsx` and replace ALL content with:

```typescript
'use client';

import { use } from 'react';
import { GenerationView } from '@/app/components/GenerationView';

export default function GenerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <GenerationView generationId={id} />;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. If errors mention `ResultsDisplay` or `SceneAssetPanel`, those are stale references — verify imports were removed.

- [ ] **Step 3: Commit**

```bash
git add app/generations/[id]/page.tsx
git commit -m "refactor(history): rewrite /generations/[id] page to use GenerationView"
```

---

## Task 6: Delete Old Components

**Files:**
- Delete: `app/components/ResultsDisplay.tsx`
- Delete: `app/components/SceneAssetPanel.tsx`

After Task 5 the page no longer imports these. Verify before deleting.

- [ ] **Step 1: Verify no remaining imports**

Run from project root:
```bash
grep -rn "ResultsDisplay\|SceneAssetPanel" app/ 2>&1 | grep -v "^app/components/ResultsDisplay\.tsx\|^app/components/SceneAssetPanel\.tsx"
```

Expected: empty output (no other file imports these).

If any references remain, STOP and report the file paths — they need to be cleaned up first.

- [ ] **Step 2: Delete both files**

```bash
rm app/components/ResultsDisplay.tsx
rm app/components/SceneAssetPanel.tsx
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. If TypeScript reports missing modules or stale references, restore the deleted files (`git checkout -- app/components/ResultsDisplay.tsx app/components/SceneAssetPanel.tsx`) and investigate.

- [ ] **Step 4: Commit**

```bash
git add -A app/components/ResultsDisplay.tsx app/components/SceneAssetPanel.tsx
git commit -m "refactor(history): remove ResultsDisplay and SceneAssetPanel (replaced)"
```

---

## Task 7: Manual Smoke Test + Verification

**Files:** none modified — verification only.

Walk through manual test plan from the spec to verify the new read-only Riwayat detail behaves correctly across states.

- [ ] **Step 1: Start dev server (if not already running)**

If dev server is currently down (you ran `npm run build` recently which corrupts dev cache), do clean start:
```bash
ps aux | grep -E "next dev|next-server" | grep -v grep | awk '{print $2}' | xargs kill 2>/dev/null
rm -rf .next
npm run dev &
sleep 5
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000
```

Expected: `HTTP 307` (redirect from / to /studio or /dashboard).

- [ ] **Step 2: Manual UI walkthrough — successful generation**

Open in browser: `http://localhost:3000/history`. Click any generation with status "Selesai".

Verify:
- [ ] No tabs visible (no "Scripts & Variasi" / "Image & Video" tabs)
- [ ] Page header shows: title + status badge + meta line + (optional) variation dropdown + (optional) "Lihat Naskah Lengkap" button + Download Semua ZIP button
- [ ] Scene list rendered as cards (NOT in tabs)
- [ ] Each scene card shows: scene title, image+video status badges, image preview, video player, prompt block (collapsed by default if long), Download MP4 button (when video_url exists)
- [ ] Click "Tampilkan lengkap" on a long prompt → expands. Click "Sembunyikan" → collapses.
- [ ] No Edit Prompt textarea, no Regenerate Image button, no Upload Image Sendiri button anywhere
- [ ] Click "Download MP4" on a scene → browser downloads the file with name `scene-N.mp4`
- [ ] Click "Download Semua ZIP" → opens new tab to `/api/generations/{id}/download?type=all`

- [ ] **Step 3: Manual UI walkthrough — multi-variation generation (only if available)**

If you have any "Dari Nol" generation with >1 variation:
- [ ] Variation picker dropdown is visible in header
- [ ] Select different variation → scene list updates
- [ ] If variation has `directors_script` → "Lihat Naskah Lengkap" button visible → click → modal opens with formatted text
- [ ] Click "Copy ke Clipboard" → button shows "Tersalin" briefly
- [ ] Click "Tutup" → modal closes

- [ ] **Step 4: Manual UI walkthrough — failed generation**

If you have any generation with status "failed" / "canceled" (or trigger one):
- [ ] Header shows red "Gagal" badge
- [ ] Card displays warning icon + error message
- [ ] "Buat Ulang di Studio" button visible → click → navigate to `/studio`
- [ ] No retry inline buttons

- [ ] **Step 5: Manual UI walkthrough — in-progress generation**

If you can trigger a fresh generation (Studio Punya Aset → upload foto → click "Buat Video"):
- [ ] Browser redirects to `/generations/{id}`
- [ ] Page shows in-progress view: progress bar + label
- [ ] Open DevTools Network tab — verify polling fetch every ~5 sec to `/api/generations/{id}` and `/api/generations/{id}/scenes`
- [ ] When generation completes, page auto-transitions to succeeded view (no manual refresh needed)

- [ ] **Step 6: Edge cases**

- [ ] Open `http://localhost:3000/generations/000000000000000000000000` (invalid id format) → "Generation tidak ditemukan" + back button
- [ ] Open `http://localhost:3000/generations/aaaaaaaaaaaaaaaaaaaaaaaa` (valid format, non-existent) → 404 → "Generation tidak ditemukan" + back button

- [ ] **Step 7: Production readiness checklist**

- [ ] No console.error in browser DevTools while navigating between Riwayat list and detail
- [ ] No 404 from `/api/storage/...` URLs (storage URL fix applied earlier — verify no double `/storage/storage/`)
- [ ] Bahasa Indonesia konsisten di semua copy (no English leaking through)
- [ ] Responsive: resize browser to mobile width — image+video stack vertically, downloads still accessible

If any test fails, file as bug or fix immediately if simple.

- [ ] **Step 8: Final commit (if any small fixes during verification)**

If any small fixes were applied during the walkthrough:
```bash
git add <changed-files>
git commit -m "fix(history): <description of fix>"
```

Otherwise no commit needed.

Suggested PR title for merging this work:
```
refactor(history): simplify Riwayat detail to read-only view
```

---

## Summary

After completing all 7 tasks:
- **Files created:** 4 (VariationPicker, DirectorsScriptModal, SceneViewCard, GenerationView)
- **Files modified:** 1 (`app/generations/[id]/page.tsx` — full rewrite, drops from ~261 lines to ~12 lines)
- **Files deleted:** 2 (ResultsDisplay.tsx 612 lines, SceneAssetPanel.tsx 542 lines)
- **Net code reduction:** ~700 LOC less in `app/components/` (offset by ~500 LOC across new components, but better organized + single-responsibility)
- **No API/DB changes** — only frontend refactor
- **No new deps** — uses existing shadcn/ui (`Dialog`, `Select`, `Card`, `Button`, `Badge`, `Progress`)

The Riwayat detail page becomes a pure read-only view with auto-poll for in-progress, modal for optional Naskah Lengkap, dropdown picker for multi-variation, and zero mutation buttons. All edit/upload/regenerate workflows stay in Studio (where they belong).
