'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Loader2, RefreshCw, Download, AlertCircle, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import type { Clip } from '@/app/lib/types';

interface ClipResultsProps {
  generationId: string;
  clips: Clip[];
  productNotes?: string;
  styleNotes?: string;
  onClipUpdated?: () => void;
}

export function ClipResults({ generationId, clips, productNotes = '', styleNotes = '', onClipUpdated }: ClipResultsProps) {
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [expandedClip, setExpandedClip] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 1500);
    });
  };

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

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground line-clamp-2">{clip.prompt}</div>
              <button
                type="button"
                onClick={() => setExpandedClip(expandedClip === clip.index ? null : clip.index)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                {expandedClip === clip.index ? (
                  <>
                    <ChevronUp className="w-3 h-3" /> Sembunyikan prompt lengkap
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" /> Lihat prompt lengkap
                  </>
                )}
              </button>
            </div>

            {expandedClip === clip.index && (
              <div className="space-y-3 border-t pt-3 text-xs">
                {productNotes && (
                  <PromptBlock
                    label="Product Detail"
                    value={productNotes}
                    fieldId={`product-${clip.index}`}
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                  />
                )}
                {styleNotes && (
                  <PromptBlock
                    label="Style Notes"
                    value={styleNotes}
                    fieldId={`style-${clip.index}`}
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                  />
                )}
                <PromptBlock
                  label="Clip Prompt"
                  value={clip.prompt}
                  fieldId={`prompt-${clip.index}`}
                  copiedField={copiedField}
                  onCopy={copyToClipboard}
                />
                {(productNotes || styleNotes) && (
                  <PromptBlock
                    label="Full Prompt (gabungan, dikirim ke Veo)"
                    value={[productNotes, styleNotes, clip.prompt].filter(Boolean).join('\n\n')}
                    fieldId={`full-${clip.index}`}
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                  />
                )}
              </div>
            )}

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

interface PromptBlockProps {
  label: string;
  value: string;
  fieldId: string;
  copiedField: string | null;
  onCopy: (text: string, fieldId: string) => void;
}

function PromptBlock({ label, value, fieldId, copiedField, onCopy }: PromptBlockProps) {
  const wordCount = value.trim().split(/\s+/).length;
  const charCount = value.length;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{wordCount} kata · {charCount} char</span>
          <button
            type="button"
            onClick={() => onCopy(value, fieldId)}
            className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground"
            title="Copy ke clipboard"
          >
            {copiedField === fieldId ? (
              <><Check className="w-3 h-3" /> Copied</>
            ) : (
              <><Copy className="w-3 h-3" /> Copy</>
            )}
          </button>
        </div>
      </div>
      <pre className="bg-muted/50 rounded-md p-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed border">
        {value}
      </pre>
    </div>
  );
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
