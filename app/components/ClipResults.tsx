'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Loader2, RefreshCw, Download, AlertCircle, ChevronDown, ChevronUp, Copy, Check, ArrowRight, Sparkles } from 'lucide-react';
import { Textarea } from './ui/textarea';
import type { Clip } from '@/app/lib/types';

interface ClipResultsProps {
  generationId: string;
  clips: Clip[];
  productNotes?: string;
  styleNotes?: string;
  onClipUpdated?: () => void;
  concatMode?: boolean;
  selectedForConcat?: number[];
  onToggleConcatSelect?: (idx: number) => void;
}

export function ClipResults({ generationId, clips, productNotes = '', styleNotes = '', onClipUpdated, concatMode, selectedForConcat, onToggleConcatSelect }: ClipResultsProps) {
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [expandedClip, setExpandedClip] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [extendingClip, setExtendingClip] = useState<Clip | null>(null);
  const [extendPrompt, setExtendPrompt] = useState('');
  const [suggestingPrompt, setSuggestingPrompt] = useState(false);
  const [submittingExtend, setSubmittingExtend] = useState(false);

  const handleSuggestPrompt = async (clip: Clip) => {
    setSuggestingPrompt(true);
    try {
      const res = await fetch('/api/studio/suggest-extend-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId, sourceClipIndex: clip.index }),
      });
      if (!res.ok) throw new Error('Gagal generate prompt');
      const data = await res.json();
      setExtendPrompt(data.prompt);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal generate prompt');
    } finally {
      setSuggestingPrompt(false);
    }
  };

  const handleExtend = async () => {
    if (!extendingClip || !extendPrompt.trim()) return;
    setSubmittingExtend(true);
    try {
      const res = await fetch('/api/studio/extend-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId,
          sourceClipIndex: extendingClip.index,
          prompt: extendPrompt.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Gagal extend');
      }
      setExtendingClip(null);
      setExtendPrompt('');
      onClipUpdated?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal extend video');
    } finally {
      setSubmittingExtend(false);
    }
  };

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
          <CardContent className="p-4 space-y-3 relative">
            {concatMode && clip.video_status === 'done' && (
              <input
                type="checkbox"
                className="w-4 h-4 absolute top-3 left-3 cursor-pointer"
                checked={selectedForConcat?.includes(clip.index) ?? false}
                onChange={() => onToggleConcatSelect?.(clip.index)}
              />
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="font-semibold text-sm">
                  {clip.is_extended
                    ? `Extended (dari Clip ${(clip.extended_from_index ?? 0) + 1})`
                    : `Clip ${idx + 1}`}
                </div>
                {clip.is_extended && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700">Extended</span>
                )}
              </div>
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
              <div className="space-y-2 border-t pt-3 text-xs">
                {/* Untuk Imagen — accordion */}
                {(productNotes || styleNotes) && (
                  <PromptAccordion label="Untuk Imagen (generate start image)">
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
                      label="Clip Prompt (original)"
                      value={clip.prompt}
                      fieldId={`prompt-${clip.index}`}
                      copiedField={copiedField}
                      onCopy={copyToClipboard}
                    />
                  </PromptAccordion>
                )}
                {/* Untuk Veo — accordion */}
                <PromptAccordion label="Untuk Veo (generate video)" defaultOpen>
                  <PromptBlock
                    label="Veo Prompt (dikirim ke Veo)"
                    value={[styleNotes, clip.veo_prompt ?? clip.prompt].filter(Boolean).join('\n\n')}
                    fieldId={`veo-${clip.index}`}
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                  />
                </PromptAccordion>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {clip.generated_video_path && (
                <Button asChild size="sm" variant="outline">
                  <a href={clip.generated_video_path} download>
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                  </a>
                </Button>
              )}
              {clip.video_status === 'done' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setExtendingClip(clip); setExtendPrompt(''); }}
                >
                  <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                  Extend
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
      {extendingClip && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-lg space-y-4 p-6">
            <h3 className="font-semibold text-base">
              Extend Clip {extendingClip.index + 1}
            </h3>
            <p className="text-sm text-muted-foreground">
              Deskripsikan apa yang terjadi selanjutnya setelah clip ini.
            </p>
            <Textarea
              value={extendPrompt}
              onChange={(e) => setExtendPrompt(e.target.value)}
              placeholder="Contoh: Camera slowly zooms out revealing the full product on a marble table..."
              className="min-h-[100px] text-sm"
            />
            <div className="flex gap-2 justify-between">
              <Button
                size="sm"
                variant="outline"
                disabled={suggestingPrompt}
                onClick={() => handleSuggestPrompt(extendingClip)}
              >
                {suggestingPrompt ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate Prompt</>
                )}
              </Button>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setExtendingClip(null); setExtendPrompt(''); }}
                >
                  Batal
                </Button>
                <Button
                  size="sm"
                  disabled={!extendPrompt.trim() || submittingExtend}
                  onClick={handleExtend}
                >
                  {submittingExtend ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Extending...</>
                  ) : (
                    'Extend Video'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
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

function PromptAccordion({ label, children, defaultOpen = false }: { label: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 text-xs font-semibold text-foreground"
      >
        {label}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="p-3 space-y-3">
          {children}
        </div>
      )}
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
