'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Loader2, ImageOff } from 'lucide-react';

interface AssetItem {
  id: string;
  generationId: string;
  generationTitle: string;
  type: 'uploaded' | 'generated';
  role: 'product' | 'clip-image' | 'clip-video' | null;
  image_url: string | null;
  video_url: string | null;
  label: string;
  updated_at: string;
}

export interface AssetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** filter: which assets to show. Default 'images' (excludes videos) */
  filter?: 'all' | 'images' | 'uploaded';
  /** Called when user selects an asset. Image URL passed (data URL or public URL fetched + converted). */
  onSelect: (imageDataUrl: string) => void | Promise<void>;
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function AssetPicker({ open, onOpenChange, filter = 'images', onSelect }: AssetPickerProps) {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/assets?filter=${filter}&limit=48`)
      .then((r) => r.json())
      .then((data) => setAssets((data.assets ?? []).filter((a: AssetItem) => a.image_url)))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [open, filter]);

  const handleClick = async (asset: AssetItem) => {
    if (!asset.image_url) return;
    setSelectingId(asset.id);
    try {
      const dataUrl = await urlToDataUrl(asset.image_url);
      await onSelect(dataUrl);
      onOpenChange(false);
    } catch (err) {
      alert(`Gagal load asset: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setSelectingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Pakai dari Asset</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Pilih foto dari generation sebelumnya untuk dipakai sebagai foto utama atau anchor clip.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 mt-2">
          {loading && (
            <div className="text-sm text-muted-foreground py-12 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat aset...
            </div>
          )}

          {!loading && assets.length === 0 && (
            <div className="text-sm text-muted-foreground py-12 flex flex-col items-center gap-2">
              <ImageOff className="w-8 h-8" />
              Belum ada aset.
            </div>
          )}

          {!loading && assets.length > 0 && (
            <div className="grid grid-cols-3 gap-3 pb-4">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => handleClick(asset)}
                  disabled={selectingId !== null}
                  className="border rounded-lg overflow-hidden hover:border-primary transition-colors text-left disabled:opacity-50"
                >
                  <div className="aspect-video bg-muted relative">
                    {asset.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.image_url}
                        alt={asset.label}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {selectingId === asset.id && (
                      <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="p-2 space-y-0.5">
                    <p className="text-xs font-medium truncate">{asset.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {asset.generationTitle}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
