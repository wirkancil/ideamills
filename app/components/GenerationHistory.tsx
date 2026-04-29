'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Image as ImageIcon,
  Video,
  ChevronRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface GenerationItem {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  product_identifier: string;
  creative_idea_title?: string;
  created_at: string;
  error_message?: string;
  image_count?: number;
  video_count?: number;
  script_count?: number;
}

const STATUS_CONFIG = {
  completed: { label: 'Selesai', variant: 'default' as const, icon: CheckCircle, color: 'text-green-500' },
  processing: { label: 'Proses', variant: 'secondary' as const, icon: Loader2, color: 'text-blue-500', spin: true },
  queued: { label: 'Antrian', variant: 'outline' as const, icon: Clock, color: 'text-yellow-500' },
  failed: { label: 'Gagal', variant: 'destructive' as const, icon: XCircle, color: 'text-red-500' },
};

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  if (h < 24) return `${h} jam lalu`;
  return `${d} hari lalu`;
}

export function GenerationHistory() {
  const [items, setItems] = useState<GenerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const LIMIT = 20;

  const fetchGenerations = async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    try {
      const res = await fetch(`/api/generations?limit=${LIMIT}&offset=${currentOffset}`);
      if (!res.ok) throw new Error('Gagal memuat data');
      const data = await res.json();
      const newItems: GenerationItem[] = data.generations ?? [];
      setItems((prev) => (reset || currentOffset === 0) ? newItems : [...prev, ...newItems]);
      setHasMore(newItems.length === LIMIT);
      if (!reset && currentOffset === 0) setOffset(0);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGenerations(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while any job is active
  useEffect(() => {
    const hasActive = items.some((i) => i.status === 'queued' || i.status === 'processing');
    if (!hasActive) return;
    const interval = setInterval(() => fetchGenerations(true), 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const handleLoadMore = () => {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    fetchGenerations();
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border animate-pulse">
            <div className="w-4 h-4 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-3.5 bg-muted rounded w-40" />
                <div className="h-4 bg-muted rounded w-12" />
              </div>
              <div className="h-2.5 bg-muted rounded w-24" />
            </div>
            <div className="w-4 h-4 bg-muted rounded shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <Sparkles className="w-10 h-10 text-muted-foreground mx-auto" />
        <p className="text-muted-foreground">Belum ada generation.</p>
        <Link href="/studio">
          <Button size="sm">Buat Video</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{items.length} generation</p>
        <Button variant="ghost" size="sm" onClick={() => fetchGenerations(true)} className="h-7 text-xs">
          <RefreshCw className="w-3 h-3 mr-1" />
          Refresh
        </Button>
      </div>

      {items.map((item) => {
        const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.queued;
        const Icon = cfg.icon;
        const isActive = item.status === 'queued' || item.status === 'processing';

        return (
          <Link key={item.id} href={`/generations/${item.id}`}>
            <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors group">
              {/* Status icon */}
              <Icon className={`w-4 h-4 shrink-0 ${cfg.color} ${'spin' in cfg && cfg.spin ? 'animate-spin' : ''}`} />

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">
                    {item.product_identifier === 'enhanced-flow'
                      ? (item.creative_idea_title?.slice(0, 40) || `Iklan #${item.id.slice(-6)}`)
                      : item.product_identifier?.slice(0, 40) || `Job ${item.id.slice(-6)}`}
                  </span>
                  <Badge variant={cfg.variant} className="text-xs h-5">{cfg.label}</Badge>
                </div>

                {/* Progress bar for active jobs */}
                {isActive && (
                  <div className="mt-1.5">
                    <Progress value={item.progress} className="h-1" />
                  </div>
                )}

                {/* Asset counts + date */}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>{formatRelative(item.created_at)}</span>
                  {item.script_count != null && (
                    <span>{item.script_count} scripts</span>
                  )}
                  {item.image_count != null && item.image_count > 0 && (
                    <span className="flex items-center gap-0.5">
                      <ImageIcon className="w-3 h-3" />{item.image_count}
                    </span>
                  )}
                  {item.video_count != null && item.video_count > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Video className="w-3 h-3" />{item.video_count}
                    </span>
                  )}
                  {item.status === 'failed' && item.error_message && (
                    <span className="text-destructive truncate max-w-[200px]">{item.error_message}</span>
                  )}
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
            </div>
          </Link>
        );
      })}

      {hasMore && (
        <Button variant="outline" size="sm" className="w-full mt-2" onClick={handleLoadMore}>
          Muat lebih banyak
        </Button>
      )}
    </div>
  );
}
