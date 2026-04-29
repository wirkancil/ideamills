'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/app/components/TopBar';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Image as ImageIcon, Video, RefreshCw, Play, ExternalLink, Loader2, Upload, User } from 'lucide-react';
import React from 'react';

type Filter = 'all' | 'images' | 'videos' | 'uploaded';

interface Asset {
  id: string;
  generationId: string;
  generationTitle: string;
  type: 'generated' | 'uploaded';
  role?: 'product' | 'model' | null;
  struktur?: string;
  naskah_vo: string;
  image_url: string | null;
  video_url: string | null;
  image_status?: string;
  video_status?: string;
  image_source?: string | null;
  updated_at: string;
}

const LIMIT = 48;

export default function AssetsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const fetchAssets = useCallback(async (currentOffset: number, reset: boolean) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const res = await fetch(`/api/assets?filter=${filter}&limit=${LIMIT}&offset=${currentOffset}`);
      if (!res.ok) return;
      const data = await res.json();
      setAssets((prev) => reset ? data.assets : [...prev, ...data.assets]);
      setTotal(data.total);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter]);

  useEffect(() => {
    setOffset(0);
    fetchAssets(0, true);
  }, [fetchAssets]);

  const hasMore = offset + LIMIT < total;

  function loadMore() {
    const next = offset + LIMIT;
    setOffset(next);
    fetchAssets(next, false);
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Aset</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Semua foto dan video yang sudah di-generate.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => fetchAssets(0, true)} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-6 border-b">
          {([
            { key: 'all', label: 'Semua', icon: null },
            { key: 'images', label: 'Foto AI', icon: <ImageIcon className="w-3.5 h-3.5" /> },
            { key: 'videos', label: 'Video', icon: <Video className="w-3.5 h-3.5" /> },
            { key: 'uploaded', label: 'Upload Saya', icon: <Upload className="w-3.5 h-3.5" /> },
          ] as { key: Filter; label: string; icon: React.ReactNode }[]).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                filter === f.key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.icon}{f.label}
            </button>
          ))}
          {!loading && <span className="ml-auto text-xs text-muted-foreground">{total} aset</span>}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-video bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && assets.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Belum ada aset.</p>
            <Link href="/studio">
              <Button size="sm">Mulai di Studio</Button>
            </Link>
          </div>
        )}

        {/* Grid */}
        {!loading && assets.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center mt-8">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Memuat...</> : 'Muat lebih banyak'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function AssetCard({ asset }: { asset: Asset }) {
  const [videoPlaying, setVideoPlaying] = useState(false);

  return (
    <div className="group relative rounded-xl overflow-hidden border bg-muted/30 hover:border-primary transition-colors">
      {/* Media */}
      <div className="aspect-video relative bg-black">
        {asset.video_url && videoPlaying ? (
          <video
            src={asset.video_url}
            controls
            autoPlay
            className="w-full h-full object-contain"
            onEnded={() => setVideoPlaying(false)}
          />
        ) : asset.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.image_url} alt={asset.naskah_vo} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
          </div>
        )}

        {/* Video play overlay */}
        {asset.video_url && !videoPlaying && (
          <button
            type="button"
            onClick={() => setVideoPlaying(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-5 h-5 text-black ml-0.5" />
            </div>
          </button>
        )}

        {/* Badges */}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {asset.type === 'uploaded' && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-black/60 text-white border-0 gap-1">
              {asset.role === 'model' ? <User className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
              {asset.role === 'model' ? 'Model' : 'Produk'}
            </Badge>
          )}
          {asset.type === 'generated' && asset.image_url && !asset.video_url && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-black/60 text-white border-0">
              <ImageIcon className="w-3 h-3" />
            </Badge>
          )}
          {asset.video_url && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-black/60 text-white border-0">
              <Video className="w-3 h-3" />
            </Badge>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5 space-y-1">
        <p className="text-xs text-muted-foreground truncate">{asset.generationTitle}</p>
        {asset.naskah_vo && (
          <p className="text-xs line-clamp-2 leading-relaxed">{asset.naskah_vo}</p>
        )}
        <Link
          href={`/generations/${asset.generationId}?tab=assets`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Lihat generation
        </Link>
      </div>
    </div>
  );
}
