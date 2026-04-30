'use client';

import { useRef, useState } from 'react';
import { Upload, Sparkles, Image as ImageIcon, FolderOpen } from 'lucide-react';
import type { ClipImageMode } from '@/app/lib/types';
import { AssetPicker } from '@/app/components/AssetPicker';

interface ImageSlotProps {
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;
  productPreview: string | null;
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

export function ImageSlot({ imageMode, imageDataUrl, productPreview, onChange }: ImageSlotProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  const handleUpload = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    onChange('override', dataUrl);
  };

  const previewSrc =
    imageMode === 'override' ? imageDataUrl :
    imageMode === 'inherit' ? productPreview :
    null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground leading-snug">
        Foto anchor untuk Veo (image-to-video). Default pakai foto utama; ganti
        kalau clip ini butuh visual berbeda, atau pilih AI untuk generate fresh image.
      </p>
      <div className="flex items-center gap-2 text-xs">
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="clip image" className="w-12 h-8 object-cover rounded-md border" />
        ) : (
          <div className="w-12 h-8 rounded-md border bg-muted flex items-center justify-center">
            <ImageIcon className="w-3 h-3 text-muted-foreground" />
          </div>
        )}

        <span className="text-muted-foreground">
          {imageMode === 'inherit' && 'foto utama'}
          {imageMode === 'override' && 'foto khusus'}
          {imageMode === 'ai-generate' && 'AI generate'}
        </span>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="ml-auto px-2 py-1 rounded-md border hover:bg-muted flex items-center gap-1"
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
          onClick={() => onChange('ai-generate', null)}
          className={`px-2 py-1 rounded-md border flex items-center gap-1 ${
            imageMode === 'ai-generate' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
        >
          <Sparkles className="w-3 h-3" /> AI
        </button>

        {imageMode !== 'inherit' && (
          <button
            type="button"
            onClick={() => onChange('inherit', null)}
            className="px-2 py-1 rounded-md border hover:bg-muted text-muted-foreground"
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

      <AssetPicker
        open={assetPickerOpen}
        onOpenChange={setAssetPickerOpen}
        filter="images"
        onSelect={(dataUrl) => onChange('override', dataUrl)}
      />
    </div>
  );
}
