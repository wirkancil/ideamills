'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Progress } from '@/app/components/ui/progress';
import { ClipResults } from './ClipResults';
import { LegacyFallback } from './LegacyFallback';
import type { Clip, GenerationStatus } from '@/app/lib/types';

const POLL_INTERVAL_MS = 5000;

export interface GenerationViewProps {
  generationId: string;
}

interface GenerationApiResponse {
  id: string;
  format_version?: 'v2' | 'legacy';
  status: GenerationStatus['status'];
  progress: number;
  progressLabel?: string;
  error?: string;
  createdAt: string;
  productIdentifier?: string;
  creativeIdeaTitle?: string | null;
  productNotes?: string;
  styleNotes?: string;
  clips?: Clip[];
}

const ACTIVE_STATUSES = new Set<GenerationStatus['status']>(['queued', 'running', 'processing']);

export function GenerationView({ generationId }: GenerationViewProps) {
  const router = useRouter();
  const [generation, setGeneration] = useState<GenerationApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchGeneration = useCallback(async () => {
    try {
      const res = await fetch(`/api/generations/${generationId}`);

      if (res.status === 404) {
        setNotFound(true);
        return;
      }

      if (!res.ok) {
        const text = await res.text();
        setNetworkError(`Error ${res.status}: ${text.slice(0, 200)}`);
        return;
      }

      const data = (await res.json()) as GenerationApiResponse;
      setGeneration(data);
      setNetworkError(null);
    } catch (err) {
      setNetworkError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [generationId]);

  useEffect(() => {
    fetchGeneration();
  }, [fetchGeneration]);

  // Auto-poll while generation is in progress
  useEffect(() => {
    if (!generation) return;
    const isActive = ACTIVE_STATUSES.has(generation.status);
    if (isActive) {
      pollRef.current = setInterval(fetchGeneration, POLL_INTERVAL_MS);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [generation, fetchGeneration]);

  function handleBack() {
    router.push('/history');
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <p className="text-muted-foreground text-center">Memuat...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <Button variant="ghost" onClick={handleBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Kembali ke Riwayat
        </Button>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Generation tidak ditemukan.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (networkError && !generation) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <Button variant="ghost" onClick={handleBack} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Kembali ke Riwayat
        </Button>
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-destructive">{networkError}</p>
            <Button onClick={fetchGeneration}>Coba Lagi</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!generation) return null;

  if (generation.format_version === 'legacy') {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Kembali ke Riwayat
        </Button>
        <LegacyFallback
          generationId={generationId}
          productIdentifier={generation.productIdentifier}
          creativeIdeaTitle={generation.creativeIdeaTitle ?? undefined}
        />
      </div>
    );
  }

  // V2 (default for new generations)
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <Button variant="ghost" onClick={handleBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Kembali ke Riwayat
      </Button>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{generation.creativeIdeaTitle ?? 'Generation'}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(generation.createdAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}{' '}
          • {(generation.clips ?? []).length} clip
        </p>
      </div>

      {ACTIVE_STATUSES.has(generation.status) && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{generation.progressLabel ?? 'Memproses...'}</span>
              <span>{generation.progress}%</span>
            </div>
            <Progress value={generation.progress} />
          </CardContent>
        </Card>
      )}

      <ClipResults
        generationId={generationId}
        clips={generation.clips ?? []}
        productNotes={generation.productNotes ?? ''}
        styleNotes={generation.styleNotes ?? ''}
        onClipUpdated={fetchGeneration}
      />
    </div>
  );
}
