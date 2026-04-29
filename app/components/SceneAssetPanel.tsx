'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Card, CardContent } from './ui/card';
import {
  Image as ImageIcon,
  Video,
  Upload,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react';
import type { AssetStatus, SceneAssetState } from '../lib/types';

interface SceneAssetPanelProps {
  generationId: string;
}

const STATUS_BADGE: Record<AssetStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Belum', variant: 'outline' },
  queued: { label: 'Antrian...', variant: 'secondary' },
  generating: { label: 'Generating...', variant: 'secondary' },
  done: { label: 'Selesai', variant: 'default' },
  failed: { label: 'Gagal', variant: 'destructive' },
};

function StatusBadge({ status }: { status: AssetStatus }) {
  const { label, variant } = STATUS_BADGE[status];
  return <Badge variant={variant} className="text-xs">{label}</Badge>;
}

function SceneCard({
  scene,
  selected,
  onToggleSelect,
  onRegenerateImage,
  onUploadImage,
  onPromptChange,
  onRetryVideo,
}: {
  scene: SceneAssetState;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onRegenerateImage: (sceneId: string, prompt: string) => void;
  onUploadImage: (sceneId: string, file: File) => void;
  onPromptChange: (sceneId: string, prompt: string) => void;
  onRetryVideo: (sceneId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(scene.text_to_image);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Card className={`transition-all ${selected ? 'ring-2 ring-primary' : ''}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(scene.id)}
              className="w-4 h-4 shrink-0"
            />
            <Badge variant="outline" className="text-xs shrink-0">{scene.struktur}</Badge>
            <span className="text-sm text-muted-foreground truncate">{scene.naskah_vo.slice(0, 60)}…</span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Image + Video status */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Image:</span>
            {(scene.image_status === 'generating' || scene.image_status === 'queued') ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
            ) : scene.image_status === 'done' ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            ) : scene.image_status === 'failed' ? (
              <XCircle className="w-3.5 h-3.5 text-destructive" />
            ) : null}
            <StatusBadge status={scene.image_status} />
            {scene.image_source === 'user' && (
              <Badge variant="outline" className="text-xs">custom</Badge>
            )}
            {scene.image_status === 'failed' && (
              <button
                type="button"
                onClick={() => onRegenerateImage(scene.id, editedPrompt)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline ml-1"
              >
                <RefreshCw className="w-3 h-3" />Retry
              </button>
            )}
          </div>
          {scene.image_status === 'failed' && scene.image_error && (
            <p className="text-xs text-destructive pl-5">{scene.image_error}</p>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            <Video className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Video:</span>
            {(scene.video_status === 'generating' || scene.video_status === 'queued') ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
            ) : scene.video_status === 'done' ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            ) : scene.video_status === 'failed' ? (
              <XCircle className="w-3.5 h-3.5 text-destructive" />
            ) : null}
            <StatusBadge status={scene.video_status} />
            {scene.video_status === 'failed' && (
              <button
                type="button"
                onClick={() => onRetryVideo(scene.id)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline ml-1"
              >
                <RefreshCw className="w-3 h-3" />Retry
              </button>
            )}
          </div>
          {scene.video_status === 'failed' && scene.video_error && (
            <p className="text-xs text-destructive pl-5">{scene.video_error}</p>
          )}
        </div>

        {/* Preview thumbnails */}
        {(scene.image_url || scene.video_url) && (
          <div className="flex gap-3">
            {scene.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={scene.image_url}
                alt="generated"
                className="w-24 h-14 object-cover rounded border"
              />
            )}
            {scene.video_url && (
              <video
                src={scene.video_url}
                controls
                className="w-48 h-28 rounded border bg-black object-contain"
                preload="metadata"
              />
            )}
          </div>
        )}

        {/* Expanded: prompt editor + actions */}
        {expanded && (
          <div className="space-y-3 pt-1 border-t">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Prompt Text2Img</label>
              <Textarea
                value={editedPrompt}
                onChange={(e) => {
                  setEditedPrompt(e.target.value);
                  onPromptChange(scene.id, e.target.value);
                }}
                rows={3}
                className="text-xs"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onRegenerateImage(scene.id, editedPrompt)}
                disabled={scene.image_status === 'generating'}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Regenerate Image
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-3 h-3 mr-1" />
                Upload Image Sendiri
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadImage(scene.id, file);
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SceneAssetPanel({ generationId }: SceneAssetPanelProps) {
  const [scenes, setScenes] = useState<SceneAssetState[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  const [imageGenerating, setImageGenerating] = useState(false);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchScenes = useCallback(async () => {
    try {
      const res = await fetch(`/api/generations/${generationId}/scenes`);
      if (!res.ok) return;
      const data = await res.json();
      setScenes(data.scenes ?? []);
    } finally {
      setLoading(false);
    }
  }, [generationId]);

  useEffect(() => {
    fetchScenes();
  }, [fetchScenes]);

  // Poll while any scene is generating
  useEffect(() => {
    const hasActive = scenes.some(
      (s) => s.image_status === 'generating' || s.video_status === 'generating'
    );

    if (hasActive) {
      pollingRef.current = setInterval(fetchScenes, 4000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [scenes, fetchScenes]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(scenes.map((s) => s.id)));
  const deselectAll = () => setSelected(new Set());

  const handlePromptChange = (sceneId: string, prompt: string) => {
    setPromptOverrides((prev) => ({ ...prev, [sceneId]: prompt }));
  };

  const handleRegenerateImage = async (sceneId: string, prompt: string) => {
    // Update prompt in DB first if changed
    if (prompt !== scenes.find((s) => s.id === sceneId)?.text_to_image) {
      await fetch(`/api/generations/${generationId}/scenes/${sceneId}/prompt`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text_to_image: prompt }),
      });
    }
    await fetch(`/api/generations/${generationId}/generate-images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneIds: [sceneId] }),
    });
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, image_status: 'generating' } : s))
    );
  };

  const handleUploadImage = async (sceneId: string, file: File) => {
    const form = new FormData();
    form.append('sceneId', sceneId);
    form.append('file', file);
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, image_status: 'generating' } : s))
    );
    const res = await fetch(`/api/generations/${generationId}/upload-scene-image`, {
      method: 'POST',
      body: form,
    });
    if (res.ok) {
      fetchScenes();
    } else {
      setScenes((prev) =>
        prev.map((s) => (s.id === sceneId ? { ...s, image_status: 'failed', image_error: 'Upload gagal' } : s))
      );
    }
  };

  const handleGenerateImages = async () => {
    const sceneIds = selected.size > 0 ? Array.from(selected) : undefined;
    setImageGenerating(true);
    try {
      // Apply any prompt overrides first
      await Promise.all(
        Object.entries(promptOverrides).map(([sceneId, prompt]) =>
          fetch(`/api/generations/${generationId}/scenes/${sceneId}/prompt`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text_to_image: prompt }),
          })
        )
      );
      await fetch(`/api/generations/${generationId}/generate-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneIds }),
      });
      fetchScenes();
    } finally {
      setImageGenerating(false);
    }
  };

  const handleGenerateVideos = async () => {
    const sceneIds = selected.size > 0 ? Array.from(selected) : undefined;
    setVideoGenerating(true);
    try {
      await fetch(`/api/generations/${generationId}/generate-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneIds }),
      });
      fetchScenes();
    } finally {
      setVideoGenerating(false);
    }
  };

  const handleRetryVideo = async (sceneId: string) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, video_status: 'queued' as const } : s))
    );
    await fetch(`/api/generations/${generationId}/generate-videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneIds: [sceneId] }),
    });
    fetchScenes();
  };

  const handleRetryAllFailed = async (type: 'image' | 'video') => {
    const failedIds = scenes
      .filter((s) => (type === 'image' ? s.image_status : s.video_status) === 'failed')
      .map((s) => s.id);
    if (failedIds.length === 0) return;

    if (type === 'image') {
      setScenes((prev) =>
        prev.map((s) => failedIds.includes(s.id) ? { ...s, image_status: 'queued' as const } : s)
      );
      await fetch(`/api/generations/${generationId}/generate-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneIds: failedIds }),
      });
    } else {
      setScenes((prev) =>
        prev.map((s) => failedIds.includes(s.id) ? { ...s, video_status: 'queued' as const } : s)
      );
      await fetch(`/api/generations/${generationId}/generate-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneIds: failedIds }),
      });
    }
    fetchScenes();
  };

  const doneImages = scenes.filter((s) => s.image_status === 'done').length;
  const doneVideos = scenes.filter((s) => s.video_status === 'done').length;
  const failedImages = scenes.filter((s) => s.image_status === 'failed').length;
  const failedVideos = scenes.filter((s) => s.video_status === 'failed').length;
  // Ready for video = has image (AI generated or user uploaded)
  const readyForVideo = scenes.filter((s) => s.image_status === 'done').length;

  const handleDownload = (type: 'images' | 'videos' | 'all') => {
    window.open(`/api/generations/${generationId}/download?type=${type}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Belum ada scene dengan visual prompt. Tunggu generation selesai dulu.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            <ImageIcon className="w-4 h-4 inline mr-1" />
            {doneImages}/{scenes.length} images
          </span>
          <span>
            <Video className="w-4 h-4 inline mr-1" />
            {doneVideos}/{scenes.length} videos
          </span>
          <span>{selected.size > 0 ? `${selected.size} dipilih` : 'Semua scene'}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={selectAll}>
            Pilih Semua
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={deselectAll}>
            Reset Pilihan
          </Button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        <Button
          onClick={handleGenerateImages}
          disabled={imageGenerating}
          className="flex-1"
        >
          {imageGenerating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating Images...</>
          ) : (
            <><ImageIcon className="w-4 h-4 mr-2" />Generate Images {selected.size > 0 ? `(${selected.size})` : `(semua)`}</>
          )}
        </Button>
        <Button
          onClick={handleGenerateVideos}
          disabled={videoGenerating || readyForVideo === 0}
          variant="secondary"
          className="flex-1"
        >
          {videoGenerating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating Videos...</>
          ) : (
            <><Video className="w-4 h-4 mr-2" />Generate Videos {selected.size > 0 ? `(${selected.size})` : `(${readyForVideo} siap)`}</>
          )}
        </Button>
      </div>

      {readyForVideo === 0 && (
        <p className="text-xs text-muted-foreground">
          Upload foto atau generate image per scene agar bisa generate video.
        </p>
      )}

      {/* Download buttons */}
      {(doneImages > 0 || doneVideos > 0) && (
        <div className="flex gap-2 flex-wrap pt-1 border-t">
          <span className="text-xs text-muted-foreground self-center">Download:</span>
          {doneImages > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleDownload('images')}>
              <Download className="w-3 h-3 mr-1" />
              Semua Images ({doneImages})
            </Button>
          )}
          {doneVideos > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleDownload('videos')}>
              <Download className="w-3 h-3 mr-1" />
              Semua Videos ({doneVideos})
            </Button>
          )}
          {doneImages > 0 && doneVideos > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleDownload('all')}>
              <Download className="w-3 h-3 mr-1" />
              Download Semua (ZIP)
            </Button>
          )}
        </div>
      )}

      {/* Failed summary banner */}
      {(failedImages > 0 || failedVideos > 0) && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 flex-wrap">
          <XCircle className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-sm text-destructive flex-1">
            {failedImages > 0 && `${failedImages} image gagal`}
            {failedImages > 0 && failedVideos > 0 && ', '}
            {failedVideos > 0 && `${failedVideos} video gagal`}
          </span>
          <div className="flex gap-2">
            {failedImages > 0 && (
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleRetryAllFailed('image')}>
                <RefreshCw className="w-3 h-3 mr-1" />Retry Image
              </Button>
            )}
            {failedVideos > 0 && (
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleRetryAllFailed('video')}>
                <RefreshCw className="w-3 h-3 mr-1" />Retry Video
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Scene list */}
      <div className="space-y-2">
        {scenes.map((scene) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            selected={selected.has(scene.id)}
            onToggleSelect={toggleSelect}
            onRegenerateImage={handleRegenerateImage}
            onUploadImage={handleUploadImage}
            onPromptChange={handlePromptChange}
            onRetryVideo={handleRetryVideo}
          />
        ))}
      </div>
    </div>
  );
}
