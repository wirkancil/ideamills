'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Loader2, Merge, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Progress } from '@/app/components/ui/progress';
import { ClipResults } from './ClipResults';
import { LegacyFallback } from './LegacyFallback';
import type { Clip, GenerationStatus, ConcatenatedVideo } from '@/app/lib/types';

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
  voiceProfile?: string;
  clips?: Clip[];
  concatenated_videos?: ConcatenatedVideo[];
}

const ACTIVE_STATUSES = new Set<GenerationStatus['status']>(['queued', 'running', 'processing']);

export function GenerationView({ generationId }: GenerationViewProps) {
  const router = useRouter();
  const [generation, setGeneration] = useState<GenerationApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [concatMode, setConcatMode] = useState(false);
  const [selectedForConcat, setSelectedForConcat] = useState<number[]>([]);
  const [concatenating, setConcatenating] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (!confirm('Batalkan generation ini?')) return;
    setCancelling(true);
    try {
      await fetch(`/api/generations/${generationId}/cancel`, { method: 'POST' });
      fetchGeneration();
    } finally {
      setCancelling(false);
    }
  };

  const toggleConcatSelect = (clipIndex: number) => {
    setSelectedForConcat((prev) =>
      prev.includes(clipIndex) ? prev.filter((i) => i !== clipIndex) : [...prev, clipIndex]
    );
  };

  const handleConcatenate = async () => {
    if (selectedForConcat.length < 2) return;
    setConcatenating(true);
    try {
      const res = await fetch('/api/studio/concatenate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId, clipIndices: selectedForConcat }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal concatenate');
      }
      setConcatMode(false);
      setSelectedForConcat([]);
      fetchGeneration();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menggabungkan video');
    } finally {
      setConcatenating(false);
    }
  };

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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">
            {new Date(generation.createdAt).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}{' '}
            • {(generation.clips ?? []).length} clip
          </p>
          {(generation.clips ?? []).filter((c) => c.video_status === 'done').length >= 2 && !concatMode && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setConcatMode(true); setSelectedForConcat([]); }}
            >
              <Merge className="w-3.5 h-3.5 mr-1.5" />
              Gabungkan Clips
            </Button>
          )}
          {concatMode && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedForConcat.length} dipilih</span>
              <Button size="sm" variant="ghost" onClick={() => { setConcatMode(false); setSelectedForConcat([]); }}>
                Batal
              </Button>
              <Button
                size="sm"
                disabled={selectedForConcat.length < 2 || concatenating}
                onClick={handleConcatenate}
              >
                {concatenating ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Menggabungkan...</>
                ) : (
                  'Gabungkan'
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {ACTIVE_STATUSES.has(generation.status) && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{generation.progressLabel ?? 'Memproses...'}</span>
              <div className="flex items-center gap-3">
                <span>{generation.progress}%</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                  Batalkan
                </Button>
              </div>
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
        voiceProfile={generation.voiceProfile ?? ''}
        onClipUpdated={fetchGeneration}
        concatMode={concatMode}
        selectedForConcat={selectedForConcat}
        onToggleConcatSelect={toggleConcatSelect}
      />

      {(generation.concatenated_videos ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Video Gabungan</h2>
          {(generation.concatenated_videos ?? []).map((cv) => (
            <Card key={cv.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Video Gabungan ({cv.clip_indices.length} clips)
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    cv.status === 'done'
                      ? 'bg-green-500/10 text-green-700'
                      : cv.status === 'failed'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    {cv.status === 'done' ? 'Selesai' : cv.status === 'failed' ? 'Gagal' : 'Processing'}
                  </span>
                </div>
                {cv.status === 'done' && cv.local_path && (
                  <div className="space-y-2">
                    <video src={cv.local_path} controls className="w-full rounded-lg bg-muted aspect-video" />
                    <Button asChild size="sm" variant="outline">
                      <a href={cv.local_path} download>
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                      </a>
                    </Button>
                  </div>
                )}
                {cv.status === 'failed' && cv.error && (
                  <p className="text-xs text-destructive">{cv.error}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
