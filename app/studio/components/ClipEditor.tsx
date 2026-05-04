'use client';

import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Plus, Trash2, Video, Loader2, BookOpen, Wand2 } from 'lucide-react';
import type { ClipImageMode, DBScriptLibrary } from '@/app/lib/types';
import { ImageSlot } from './ImageSlot';
import { StyleNotesField } from './StyleNotesField';
import { ProductNotesField } from './ProductNotesField';
import { ScriptPicker } from '@/app/components/ScriptPicker';

export type ImageModel = 'imagen-4' | 'nano-banana-2' | 'nano-banana-pro';

export const IMAGE_MODEL_OPTIONS: ReadonlyArray<{ id: ImageModel; label: string }> = [
  { id: 'imagen-4', label: 'Imagen 4' },
  { id: 'nano-banana-2', label: 'Nano Banana 2' },
  { id: 'nano-banana-pro', label: 'Nano Banana Pro' },
];

export const DEFAULT_IMAGE_MODEL: ImageModel = 'imagen-4';

export interface ClipDraft {
  index: number;
  prompt: string;
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;
  imageModel?: ImageModel;
}

interface ClipEditorProps {
  productNotes: string;
  onProductNotesChange: (v: string) => void;
  styleNotes: string;
  onStyleNotesChange: (v: string) => void;
  clips: ClipDraft[];
  onClipsChange: (clips: ClipDraft[]) => void;
  productPreview: string | null;
  aspectRatio: 'portrait' | 'landscape';
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}

const MAX_CLIPS = 6;
const MIN_CLIPS = 1;

export function ClipEditor({
  productNotes,
  onProductNotesChange,
  styleNotes,
  onStyleNotesChange,
  clips,
  onClipsChange,
  productPreview,
  aspectRatio,
  submitting,
  onSubmit,
  onBack,
}: ClipEditorProps) {
  const [bankPickerForClip, setBankPickerForClip] = useState<number | null>(null);
  const [enhancingClip, setEnhancingClip] = useState<number | null>(null);

  const updateClip = (index: number, updates: Partial<ClipDraft>) => {
    onClipsChange(clips.map((c) => (c.index === index ? { ...c, ...updates } : c)));
  };

  const handleBankSelect = (script: DBScriptLibrary) => {
    if (bankPickerForClip === null) return;
    updateClip(bankPickerForClip, { prompt: script.content });
    setBankPickerForClip(null);
  };

  const handleEnhance = async (clipIndex: number) => {
    const clip = clips.find((c) => c.index === clipIndex);
    if (!clip || clip.prompt.trim().length < 10) return;
    setEnhancingClip(clipIndex);
    try {
      const res = await fetch('/api/studio/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: clip.prompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Gagal enhance: ${err.error ?? res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.skipped) {
        // No-op enhance — show info to user, don't update prompt
        alert(`ℹ️ ${data.reason ?? 'Tidak ada perubahan diperlukan.'}`);
        return;
      }
      if (data.enhanced && data.enhanced !== clip.prompt) {
        updateClip(clipIndex, { prompt: data.enhanced });
      }
    } catch (err) {
      alert(`Gagal enhance: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setEnhancingClip(null);
    }
  };

  const addClip = () => {
    if (clips.length >= MAX_CLIPS) return;
    const nextIndex = Math.max(...clips.map((c) => c.index)) + 1;
    onClipsChange([...clips, { index: nextIndex, prompt: '', imageMode: 'inherit', imageModel: DEFAULT_IMAGE_MODEL }]);
  };

  const removeClip = (index: number) => {
    if (clips.length <= MIN_CLIPS) return;
    onClipsChange(clips.filter((c) => c.index !== index).map((c, i) => ({ ...c, index: i })));
  };

  const canSubmit =
    !submitting &&
    clips.length >= MIN_CLIPS &&
    clips.every((c) => {
      if (c.prompt.trim().length < 10) return false;
      if (c.imageMode === 'override' && !c.imageDataUrl) return false;
      return true;
    });

  const needsAiImage = clips.some((c) => c.imageMode === 'ai-generate' && !c.imageDataUrl);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Kembali
        </button>
      </div>

      <ProductNotesField value={productNotes} onChange={onProductNotesChange} />

      <StyleNotesField value={styleNotes} onChange={onStyleNotesChange} />

      <div className="space-y-3">
        <Label>
          {clips.length === 1
            ? 'Clip (8 detik)'
            : `Clips (${clips.length} × 8 detik = ~${clips.length * 8} detik total)`}
        </Label>

        {clips.map((clip, idx) => (
          <div key={clip.index} className="border rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Clip {idx + 1} (8 detik)</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBankPickerForClip(clip.index)}
                  className="text-[11px] px-2 py-0.5 rounded-md border hover:bg-muted flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  title="Import prompt dari Bank Scripts"
                >
                  <BookOpen className="w-3 h-3" /> Bank
                </button>
                <button
                  type="button"
                  onClick={() => handleEnhance(clip.index)}
                  disabled={enhancingClip === clip.index || clip.prompt.trim().length < 10}
                  className="text-[11px] px-2 py-0.5 rounded-md border hover:bg-muted flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Polish prompt — flip negation ke positive phrasing"
                >
                  {enhancingClip === clip.index ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3 h-3" />
                  )}
                  Enhance
                </button>
                {clips.length > MIN_CLIPS && (
                  <button
                    type="button"
                    onClick={() => removeClip(clip.index)}
                    className="text-muted-foreground hover:text-destructive ml-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <Textarea
              value={clip.prompt}
              onChange={(e) => updateClip(clip.index, { prompt: e.target.value })}
              placeholder="Describe the visual scene, action, mood for this 8-second clip..."
              rows={6}
              className="text-sm"
              maxLength={5000}
            />
            <p className="text-[10px] text-right text-muted-foreground">{clip.prompt.length} / 5000</p>

            <ImageSlot
              imageMode={clip.imageMode}
              imageDataUrl={clip.imageDataUrl}
              productPreview={productPreview}
              clipPrompt={clip.prompt}
              productNotes={productNotes}
              styleNotes={styleNotes}
              aspectRatio={aspectRatio}
              imageModel={clip.imageModel ?? DEFAULT_IMAGE_MODEL}
              onImageModelChange={(model) => updateClip(clip.index, { imageModel: model })}
              onChange={(mode, dataUrl) =>
                updateClip(clip.index, { imageMode: mode, imageDataUrl: dataUrl ?? null })
              }
            />
          </div>
        ))}

        {clips.length < MAX_CLIPS && (
          <button
            type="button"
            onClick={addClip}
            className="w-full border-2 border-dashed rounded-xl py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Tambah Clip
          </button>
        )}
      </div>

      {needsAiImage && (
        <p className="text-xs text-muted-foreground text-center">
          AI image belum di-generate — worker akan pakai foto produk sebagai fallback.
        </p>
      )}

      <Button size="lg" className="w-full" disabled={!canSubmit} onClick={onSubmit}>
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Menyiapkan video...
          </>
        ) : (
          <>
            <Video className="w-5 h-5 mr-2" />
            Buat Video
          </>
        )}
      </Button>

      <ScriptPicker
        open={bankPickerForClip !== null}
        onOpenChange={(open) => !open && setBankPickerForClip(null)}
        onSelect={handleBankSelect}
      />
    </div>
  );
}
