'use client';

import { GenerationStatus } from '../lib/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface JobStatusProps {
  status: GenerationStatus;
}

export function JobStatus({ status }: JobStatusProps) {
  const getStatusIcon = () => {
    switch (status.status) {
      case 'queued':
        return <Clock className="w-5 h-5" />;
      case 'running':
      case 'processing':
        return <Loader2 className="w-5 h-5 animate-spin" />;
      case 'succeeded':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'canceled':
        return <XCircle className="w-5 h-5 text-gray-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = () => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      queued: 'secondary',
      running: 'default',
      processing: 'default',
      succeeded: 'outline',
      failed: 'destructive',
      canceled: 'secondary',
    };

    const labels: Record<string, string> = {
      queued: 'Antrian',
      running: 'Berjalan',
      processing: 'Memproses',
      succeeded: 'Selesai',
      failed: 'Gagal',
      canceled: 'Dibatalkan',
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
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
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

        {/* Engine Info */}
        <div className="pt-4 border-t text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Engine:</span>
            <span className="font-medium">{status.engine}</span>
          </div>
          {status.productIdentifier && (
            <div className="flex justify-between mt-1">
              <span>Product ID:</span>
              <span className="font-mono text-xs">{status.productIdentifier.slice(0, 12)}...</span>
            </div>
          )}
        </div>

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

