'use client';

import { useEffect, useState } from 'react';
import { GenerationStatus } from '../lib/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Clock, CheckCircle2, XCircle, Loader2, Users } from 'lucide-react';

interface QueuePosition {
  position: number;
  ahead: number;
  estimatedWaitMs: number;
  jobType: string;
}

interface JobStatusProps {
  status: GenerationStatus;
}

function formatWait(ms: number): string {
  if (ms < 60_000) return `~${Math.ceil(ms / 1000)}d`;
  if (ms < 3600_000) return `~${Math.ceil(ms / 60_000)} menit`;
  return `~${(ms / 3600_000).toFixed(1)} jam`;
}

export function JobStatus({ status }: JobStatusProps) {
  const [queuePos, setQueuePos] = useState<QueuePosition | null>(null);

  // Fetch queue position when job is queued
  useEffect(() => {
    if (status.status !== 'queued') {
      setQueuePos(null);
      return;
    }
    let cancelled = false;
    const fetchPos = async () => {
      try {
        const res = await fetch(`/api/queue/position?generationId=${status.id}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setQueuePos(data);
      } catch {
        // ignore
      }
    };
    fetchPos();
    const interval = setInterval(fetchPos, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [status.id, status.status]);

  const getStatusIcon = () => {
    switch (status.status) {
      case 'queued':     return <Clock className="w-5 h-5" />;
      case 'running':
      case 'processing': return <Loader2 className="w-5 h-5 animate-spin" />;
      case 'succeeded':  return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed':     return <XCircle className="w-5 h-5 text-red-500" />;
      case 'canceled':   return <XCircle className="w-5 h-5 text-gray-500" />;
      default:           return null;
    }
  };

  const getStatusBadge = () => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      queued: 'secondary', running: 'default', processing: 'default',
      succeeded: 'outline', failed: 'destructive', canceled: 'secondary',
    };
    const labels: Record<string, string> = {
      queued: 'Antrian', running: 'Berjalan', processing: 'Memproses',
      succeeded: 'Selesai', failed: 'Gagal', canceled: 'Dibatalkan',
    };
    return (
      <Badge variant={variants[status.status] || 'default'}>
        {labels[status.status] || status.status}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span>Status Generasi</span>
          </div>
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Queue position — shown only when queued */}
        {status.status === 'queued' && queuePos && queuePos.position > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              Posisi antrian <span className="font-semibold text-foreground">#{queuePos.position}</span>
              {queuePos.ahead > 0 && (
                <> — {queuePos.ahead} job di depan, estimasi {formatWait(queuePos.estimatedWaitMs)}</>
              )}
            </span>
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {status.progressLabel || 'Progress'}
            </span>
            <span className="font-medium">{status.progress}%</span>
          </div>
          <Progress value={status.progress} className="h-2" />
        </div>

        {/* Counts */}
        {status.counts && (
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{status.counts.themes}</div>
              <div className="text-xs text-muted-foreground">Tema Unik</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{status.counts.scripts}</div>
              <div className="text-xs text-muted-foreground">Script Dibuat</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{status.counts.variations}</div>
              <div className="text-xs text-muted-foreground">Variasi</div>
            </div>
          </div>
        )}

        {/* Model Info */}
        {(status.engine || (status.productIdentifier && status.productIdentifier !== 'enhanced-flow')) && (
          <div className="pt-4 border-t text-sm text-muted-foreground">
            {status.engine && (
              <div className="flex justify-between">
                <span>Model:</span>
                <span className="font-medium">{status.engine}</span>
              </div>
            )}
            {status.productIdentifier && status.productIdentifier !== 'enhanced-flow' && (
              <div className="flex justify-between mt-1">
                <span>Produk:</span>
                <span className="font-mono text-xs">{status.productIdentifier.slice(0, 20)}...</span>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {status.error && (
          <div className="pt-4 border-t">
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <strong>Error:</strong> {status.error}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
