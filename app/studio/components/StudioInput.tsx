'use client';

import { useRef, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Upload, X, Loader2, Sparkles, FolderOpen } from 'lucide-react';
import { AssetPicker } from '@/app/components/AssetPicker';

interface StudioInputProps {
  productPreview: string | null;
  brief: string;
  submitting: boolean;
  error: string | null;
  onProductChange: (dataUrl: string | null) => void;
  onBriefChange: (v: string) => void;
  onSubmit: () => void;
  /** When true, omit the title/heading + submit button — useful when this component is embedded inside a page that wraps its own header & button. */
  hideSubmit?: boolean;
  /** When true, hide the brief textarea (used in Quick mode). */
  hideBrief?: boolean;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function StudioInput({
  productPreview,
  brief,
  submitting,
  error,
  onProductChange,
  onBriefChange,
  onSubmit,
  hideSubmit = false,
  hideBrief = false,
}: StudioInputProps) {
  const productRef = useRef<HTMLInputElement>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  const handleProductFile = async (file: File) => onProductChange(await fileToDataUrl(file));

  return (
    <div className="space-y-6">
      {!hideSubmit && (
        <div>
          <h2 className="text-xl font-bold">Buat Iklan dengan AI</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload foto + brief. AI generate ide & clip prompts.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>
            Foto Composite
            <span className="text-destructive ml-1">*</span>
          </Label>
          <button
            type="button"
            onClick={() => setAssetPickerOpen(true)}
            className="text-[11px] px-2 py-1 rounded-md border hover:bg-muted flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <FolderOpen className="w-3 h-3" /> Pakai dari Asset
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Upload composite (model + produk dalam 1 frame) atau hanya foto produk.
        </p>
        <div
          className="relative border-2 border-dashed rounded-xl cursor-pointer hover:border-primary transition-colors"
          onClick={() => productRef.current?.click()}
        >
          {productPreview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={productPreview} alt="Foto Composite" className="w-full h-48 object-contain rounded-xl" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onProductChange(null);
                }}
                className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 hover:bg-black/80"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-12">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Klik untuk upload</span>
            </div>
          )}
        </div>
        <input
          ref={productRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleProductFile(f);
          }}
        />
      </div>

      {!hideBrief && (
        <div className="space-y-2">
          <Label>
            Brief <span className="text-muted-foreground text-sm font-normal">(optional)</span>
          </Label>
          <Textarea
            placeholder="Skincare untuk kulit berminyak, target ibu muda, tone fresh..."
            value={brief}
            onChange={(e) => onBriefChange(e.target.value)}
            rows={3}
            maxLength={5000}
          />
          <p className="text-[10px] text-right text-muted-foreground">{brief.length} / 5000</p>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {!hideSubmit && (
        <>
          <Button size="lg" className="w-full text-base" disabled={submitting || !productPreview} onClick={onSubmit}>
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Menganalisis foto + brainstorming ide...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Ide
              </>
            )}
          </Button>
          {!productPreview && (
            <p className="text-xs text-muted-foreground text-center -mt-2">Upload foto composite untuk mulai.</p>
          )}
        </>
      )}

      <AssetPicker
        open={assetPickerOpen}
        onOpenChange={setAssetPickerOpen}
        filter="images"
        onSelect={(dataUrl) => onProductChange(dataUrl)}
      />
    </div>
  );
}
