'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Loader2, RefreshCw, Download, AlertCircle } from 'lucide-react';
import type { Clip } from '@/app/lib/types';

interface ClipResultsProps {
  generationId: string;
  clips: Clip[];
  onClipUpdated?: () => void;
}

export function ClipResults({ generationId, clips, onClipUpdated }: ClipResultsProps) {
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  const handleRegenerate = async (clip: Clip) => {
    setRegeneratingIndex(clip.index);
    try {
      const res = await fetch('/api/studio/regenerate-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId,
          clipIndex: clip.index,
          prompt: clip.prompt,
          imageMode: clip.imageMode,
          imageDataUrl: clip.imageMode === 'override' ? clip.imageDataUrl : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Gagal regenerate: ${err.error ?? res.statusText}`);
      } else {
        onClipUpdated?.();
      }
    } catch (err) {
      alert(`Gagal regenerate: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setRegeneratingIndex(null);
    }
  };

  return (
    <div className="space-y-4">
      {clips.map((clip, idx) => (
        <Card key={clip.index}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">Clip {idx + 1} (8 detik)</div>
              <ClipStatusBadge status={clip.video_status} />
            </div>

            <ClipMediaPreview clip={clip} />

            <div className="text-xs text-muted-foreground line-clamp-2">{clip.prompt}</div>

            <div className="flex gap-2">
              {clip.generated_video_path && (
                <Button asChild size="sm" variant="outline">
                  <a href={clip.generated_video_path} download>
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={regeneratingIndex === clip.index}
                onClick={() => handleRegenerate(clip)}
              >
                {regeneratingIndex === clip.index ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Regenerate
                  </>
                )}
              </Button>
            </div>

            {clip.video_error && (
              <div className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {clip.video_error}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClipStatusBadge({ status }: { status: Clip['video_status'] }) {
  const labels: Record<Clip['video_status'], { text: string; className: string }> = {
    pending: { text: 'Menunggu', className: 'bg-muted text-muted-foreground' },
    queued: { text: 'Antrian', className: 'bg-muted text-muted-foreground' },
    generating: { text: 'Generating', className: 'bg-primary/10 text-primary' },
    done: { text: 'Selesai', className: 'bg-green-500/10 text-green-700' },
    failed: { text: 'Gagal', className: 'bg-destructive/10 text-destructive' },
  };
  const { text, className } = labels[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${className}`}>{text}</span>;
}

function ClipMediaPreview({ clip }: { clip: Clip }) {
  if (clip.video_status === 'done' && clip.generated_video_path) {
    return (
      <video
        src={clip.generated_video_path}
        controls
        className="w-full rounded-lg bg-muted aspect-video"
      />
    );
  }
  if (clip.video_status === 'failed') {
    return (
      <div className="w-full rounded-lg bg-destructive/5 aspect-video flex items-center justify-center text-destructive text-sm">
        <AlertCircle className="w-5 h-5 mr-2" /> Gagal generate
      </div>
    );
  }
  return (
    <div className="w-full rounded-lg bg-muted animate-pulse aspect-video flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
    </div>
  );
}
