'use client';

import { useRef, useState } from 'react';
import { Upload, Sparkles, Image as ImageIcon, FolderOpen, Loader2 } from 'lucide-react';
import type { ClipImageMode } from '@/app/lib/types';
import { AssetPicker } from '@/app/components/AssetPicker';
import { IMAGE_MODEL_OPTIONS, type ImageModel } from './ClipEditor';

interface ImageSlotProps {
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;
  productPreview: string | null;
  clipPrompt: string;
  productNotes: string;
  styleNotes: string;
  aspectRatio: 'portrait' | 'landscape';
  imageModel: ImageModel;
  onImageModelChange: (model: ImageModel) => void;
  onChange: (mode: ClipImageMode, imageDataUrl?: string | null) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImageSlot({
  imageMode,
  imageDataUrl,
  productPreview,
  clipPrompt,
  productNotes,
  styleNotes,
  aspectRatio,
  imageModel,
  onImageModelChange,
  onChange,
}: ImageSlotProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAiGenerate = async () => {
    if (clipPrompt.trim().length < 10) {
      setError('Prompt minimal 10 karakter sebelum generate AI image.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: clipPrompt, productNotes, styleNotes, aspectRatio, model: imageModel }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.imageDataUrl) throw new Error('No imageDataUrl in response');
      onChange('ai-generate', data.imageDataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal generate image');
    } finally {
      setGenerating(false);
    }
  };

  const handleUpload = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    onChange('override', dataUrl);
  };

  const previewSrc =
    imageMode === 'override' ? imageDataUrl :
    imageMode === 'ai-generate' ? imageDataUrl :
    imageMode === 'inherit' ? productPreview :
    null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground leading-snug">
        Foto anchor untuk Veo (image-to-video). Default pakai foto utama; ganti
        kalau clip ini butuh visual berbeda, atau pilih AI untuk generate fresh image.
      </p>
      {/* Full-width preview */}
      <div
        className={`w-full rounded-lg border overflow-hidden bg-muted flex items-center justify-center ${
          aspectRatio === 'portrait' ? 'aspect-[9/16] max-h-80' : 'aspect-video'
        }`}
      >
        {generating ? (
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        ) : previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="clip image" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-12 h-12 text-muted-foreground" />
        )}
      </div>

      {/* Status label + image model picker */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <p className="text-muted-foreground">
          {imageMode === 'inherit' && '📷 Foto utama'}
          {imageMode === 'override' && '🖼️ Foto khusus'}
          {imageMode === 'ai-generate' && (imageDataUrl ? '✨ AI generated' : '✨ AI generate (klik tombol AI)')}
        </p>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>AI Model:</span>
          <select
            value={imageModel}
            onChange={(e) => onImageModelChange(e.target.value as ImageModel)}
            className="text-[11px] border rounded px-1.5 py-0.5 bg-background"
            title="Pilih AI model untuk generate image"
          >
            {IMAGE_MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Buttons row */}
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-2 py-1 rounded-md border hover:bg-muted flex items-center gap-1"
        >
          <Upload className="w-3 h-3" /> Ganti
        </button>

        <button
          type="button"
          onClick={() => setAssetPickerOpen(true)}
          className="px-2 py-1 rounded-md border hover:bg-muted flex items-center gap-1"
          title="Pakai foto dari asset"
        >
          <FolderOpen className="w-3 h-3" /> Asset
        </button>

        <button
          type="button"
          onClick={handleAiGenerate}
          disabled={generating}
          className={`px-2 py-1 rounded-md border flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
            imageMode === 'ai-generate' && imageDataUrl ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
          title={imageMode === 'ai-generate' && imageDataUrl ? 'Klik untuk regenerate' : 'Generate AI image'}
        >
          {generating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          {imageMode === 'ai-generate' && imageDataUrl ? 'Regenerate' : 'AI'}
        </button>

        {imageMode !== 'inherit' && (
          <button
            type="button"
            onClick={() => onChange('inherit', null)}
            className="ml-auto px-2 py-1 rounded-md border hover:bg-muted text-muted-foreground"
          >
            Reset
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
      </div>

      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}

      <AssetPicker
        open={assetPickerOpen}
        onOpenChange={setAssetPickerOpen}
        filter="images"
        onSelect={(dataUrl) => onChange('override', dataUrl)}
      />
    </div>
  );
}
