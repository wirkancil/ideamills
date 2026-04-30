'use client';

import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Plus, Trash2, Video, Loader2, BookOpen } from 'lucide-react';
import type { ClipImageMode, DBScriptLibrary } from '@/app/lib/types';
import { ImageSlot } from './ImageSlot';
import { StyleNotesField } from './StyleNotesField';
import { ScriptPicker } from '@/app/components/ScriptPicker';

export interface ClipDraft {
  index: number;
  prompt: string;
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;
}

interface ClipEditorProps {
  styleNotes: string;
  onStyleNotesChange: (v: string) => void;
  clips: ClipDraft[];
  onClipsChange: (clips: ClipDraft[]) => void;
  productPreview: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}

const MAX_CLIPS = 6;
const MIN_CLIPS = 2;

export function ClipEditor({
  styleNotes,
  onStyleNotesChange,
  clips,
  onClipsChange,
  productPreview,
  submitting,
  onSubmit,
  onBack,
}: ClipEditorProps) {
  const [bankPickerForClip, setBankPickerForClip] = useState<number | null>(null);

  const updateClip = (index: number, updates: Partial<ClipDraft>) => {
    onClipsChange(clips.map((c) => (c.index === index ? { ...c, ...updates } : c)));
  };

  const handleBankSelect = (script: DBScriptLibrary) => {
    if (bankPickerForClip === null) return;
    updateClip(bankPickerForClip, { prompt: script.content });
    setBankPickerForClip(null);
  };

  const addClip = () => {
    if (clips.length >= MAX_CLIPS) return;
    const nextIndex = Math.max(...clips.map((c) => c.index)) + 1;
    onClipsChange([...clips, { index: nextIndex, prompt: '', imageMode: 'inherit' }]);
  };

  const removeClip = (index: number) => {
    if (clips.length <= MIN_CLIPS) return;
    onClipsChange(clips.filter((c) => c.index !== index).map((c, i) => ({ ...c, index: i })));
  };

  const canSubmit =
    !submitting && clips.length >= MIN_CLIPS && clips.every((c) => c.prompt.trim().length >= 10);

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

      <StyleNotesField value={styleNotes} onChange={onStyleNotesChange} />

      <div className="space-y-3">
        <Label>
          Clips ({clips.length} × 8 detik = ~{clips.length * 8} detik total)
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
              rows={4}
              className="text-sm"
              maxLength={2000}
            />
            <p className="text-[10px] text-right text-muted-foreground">{clip.prompt.length} / 2000</p>

            <ImageSlot
              imageMode={clip.imageMode}
              imageDataUrl={clip.imageDataUrl}
              productPreview={productPreview}
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
