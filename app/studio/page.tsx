'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/app/components/TopBar';
import { StudioInput } from './components/StudioInput';
import { IdeaPicker } from './components/IdeaPicker';
import { ClipEditor, type ClipDraft } from './components/ClipEditor';
import {
  EnginePicker,
  DEFAULT_TEXT_MODEL,
  DEFAULT_VISION_MODEL,
  DEFAULT_VEO_MODEL,
  DEFAULT_ASPECT_RATIO,
  type TextModelId,
  type VisionModelId,
  type VeoModelId,
  type AspectRatio,
} from './components/EnginePicker';
import { ScriptPicker } from '@/app/components/ScriptPicker';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import { Loader2, Video, BookOpen, Wand2 } from 'lucide-react';
import type { DBScriptLibrary, Idea } from '@/app/lib/types';

type Mode = 'dari-nol' | 'quick';
type Step = 'input' | 'pick-idea' | 'edit-clips';

function StudioPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'quick' ? 'quick' : 'dari-nol');
  const [step, setStep] = useState<Step>('input');

  // Common state
  const [productImage, setProductImage] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [textModel, setTextModel] = useState<TextModelId>(DEFAULT_TEXT_MODEL);
  const [visionModel, setVisionModel] = useState<VisionModelId>(DEFAULT_VISION_MODEL);
  const [veoModel, setVeoModel] = useState<VeoModelId>(DEFAULT_VEO_MODEL);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(DEFAULT_ASPECT_RATIO);

  // Cross-step state
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [productNotes, setProductNotes] = useState('');
  const [styleNotes, setStyleNotes] = useState('');
  const [clips, setClips] = useState<ClipDraft[]>([]);

  // Quick mode state
  const [selectedScript, setSelectedScript] = useState<DBScriptLibrary | null>(null);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [enhancingScript, setEnhancingScript] = useState(false);

  // Loading flags
  const [generatingIdeas, setGeneratingIdeas] = useState(false);
  const [picking, setPicking] = useState(false);
  const [submittingVideo, setSubmittingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-load script if scriptId in URL (Use in Studio link)
  useEffect(() => {
    const scriptId = searchParams.get('scriptId');
    if (scriptId && !selectedScript) {
      fetch(`/api/scripts/${scriptId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.script) {
            setSelectedScript(data.script as DBScriptLibrary);
            setMode('quick');
          }
        })
        .catch(() => {
          /* ignore */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateIdeas = async () => {
    if (!productImage) {
      setError('Upload foto composite dulu.');
      return;
    }
    setGeneratingIdeas(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId,
          productImageUrl: productImage,
          modelImageUrl: null,
          brief,
          textModel,
          visionModel,
          veoModel,
          aspectRatio,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detailMsg = errBody.details
          ? Object.entries(errBody.details)
              .filter(([k]) => k !== '_errors')
              .map(([k, v]: [string, unknown]) => {
                const errs = (v as { _errors?: string[] })._errors ?? [];
                return errs.length ? `${k}: ${errs.join(', ')}` : null;
              })
              .filter(Boolean)
              .join('; ')
          : null;
        throw new Error(detailMsg || errBody.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setGenerationId(data.generationId);
      setIdeas(data.ideas);
      setStep('pick-idea');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal generate ide');
    } finally {
      setGeneratingIdeas(false);
    }
  };

  const handlePickIdea = async (selectedIdeaIndex: number) => {
    if (!generationId) return;
    setPicking(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId, selectedIdeaIndex }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setProductNotes(data.productNotes ?? '');
      setStyleNotes(data.styleNotes ?? '');
      setClips(
        (data.clips as Array<{ index: number; prompt: string; imageMode: 'inherit' | 'override' | 'ai-generate' }>).map(
          (c) => ({ index: c.index, prompt: c.prompt, imageMode: c.imageMode, imageDataUrl: null })
        )
      );
      setStep('edit-clips');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal expand idea');
    } finally {
      setPicking(false);
    }
  };

  const handleSubmitVideo = async () => {
    if (!generationId) return;
    setSubmittingVideo(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId,
          productNotes,
          styleNotes,
          clips: clips.map((c) => ({
            index: c.index,
            prompt: c.prompt,
            imageMode: c.imageMode,
            imageDataUrl:
              c.imageMode === 'override' || c.imageMode === 'ai-generate'
                ? c.imageDataUrl
                : null,
          })),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      router.push(`/generations/${generationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal submit video');
      setSubmittingVideo(false);
    }
  };

  const handleEnhanceScript = async () => {
    if (!selectedScript) return;
    setEnhancingScript(true);
    try {
      const res = await fetch('/api/studio/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: selectedScript.content, textModel }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Gagal enhance: ${err.error ?? res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.skipped) {
        alert(`ℹ️ ${data.reason ?? 'Tidak ada perubahan diperlukan.'}`);
        return;
      }
      if (data.enhanced && data.enhanced !== selectedScript.content) {
        setSelectedScript({ ...selectedScript, content: data.enhanced });
      }
    } catch (err) {
      alert(`Gagal enhance: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setEnhancingScript(false);
    }
  };

  const handleQuickGenerate = async () => {
    if (!productImage) {
      setError('Upload foto composite dulu.');
      return;
    }
    if (!selectedScript) {
      setError('Pilih script dari Bank dulu.');
      return;
    }
    setSubmittingVideo(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/quick-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImageUrl: productImage,
          scriptContent: selectedScript.content,
          scriptTitle: selectedScript.title,
          veoModel,
          aspectRatio,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detailMsg = errBody.details
          ? Object.entries(errBody.details)
              .filter(([k]) => k !== '_errors')
              .map(([k, v]: [string, unknown]) => {
                const errs = (v as { _errors?: string[] })._errors ?? [];
                return errs.length ? `${k}: ${errs.join(', ')}` : null;
              })
              .filter(Boolean)
              .join('; ')
          : null;
        throw new Error(detailMsg || errBody.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      router.push(`/generations/${data.generationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal buat video');
      setSubmittingVideo(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {step === 'input' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Buat Iklan dengan AI</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Pilih cara generate, upload foto composite, atur engine, lalu jalankan.
              </p>
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2 border rounded-xl p-1 bg-muted/30">
              <button
                type="button"
                onClick={() => setMode('dari-nol')}
                className={`text-sm py-2 rounded-lg transition-colors ${
                  mode === 'dari-nol' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                ✨ Dari Nol
              </button>
              <button
                type="button"
                onClick={() => setMode('quick')}
                className={`text-sm py-2 rounded-lg transition-colors ${
                  mode === 'quick' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📚 Quick (Pakai Script Bank)
              </button>
            </div>

            <p className="text-xs text-muted-foreground -mt-2">
              {mode === 'dari-nol'
                ? 'AI brainstorm 3-5 ide → pilih → edit clips → video.'
                : 'Pakai prompt matang dari Script Bank, langsung video tanpa ide generation.'}
            </p>

            <StudioInput
              productPreview={productImage}
              brief={brief}
              submitting={false}
              error={null}
              onProductChange={setProductImage}
              onBriefChange={setBrief}
              onSubmit={() => {
                /* form submit handled by mode-specific button below */
              }}
              hideSubmit
              hideBrief={mode === 'quick'}
            />

            <EnginePicker
              textModel={textModel}
              visionModel={visionModel}
              veoModel={veoModel}
              aspectRatio={aspectRatio}
              onTextModelChange={setTextModel}
              onVisionModelChange={setVisionModel}
              onVeoModelChange={setVeoModel}
              onAspectRatioChange={setAspectRatio}
            />

            {mode === 'quick' && (
              <div className="space-y-2 border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Script Bank</span>
                  <div className="flex items-center gap-1.5">
                    {selectedScript && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEnhanceScript}
                        disabled={enhancingScript}
                        title="Polish prompt — flip negation ke positive phrasing"
                      >
                        {enhancingScript ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Enhance
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setBankPickerOpen(true)}>
                      <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                      {selectedScript ? 'Ganti Script' : 'Pilih Script'}
                    </Button>
                  </div>
                </div>
                {selectedScript ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold">{selectedScript.title}</p>
                    <Textarea
                      value={selectedScript.content}
                      onChange={(e) =>
                        setSelectedScript({ ...selectedScript, content: e.target.value })
                      }
                      rows={8}
                      maxLength={5000}
                      className="text-xs leading-relaxed font-mono"
                      placeholder="Edit script content sebelum Buat Video..."
                    />
                    <p className="text-[10px] text-right text-muted-foreground">
                      {selectedScript.content.length} / 5000
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Belum ada script dipilih.</p>
                )}
              </div>
            )}

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            {mode === 'dari-nol' && (
              <Button
                size="lg"
                className="w-full text-base"
                disabled={generatingIdeas || !productImage}
                onClick={handleGenerateIdeas}
              >
                {generatingIdeas ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Menganalisis foto + brainstorming ide...
                  </>
                ) : (
                  <>✨ Generate Ide</>
                )}
              </Button>
            )}

            {mode === 'quick' && (
              <Button
                size="lg"
                className="w-full text-base"
                disabled={submittingVideo || !productImage || !selectedScript}
                onClick={handleQuickGenerate}
              >
                {submittingVideo ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Menyiapkan video...
                  </>
                ) : (
                  <>
                    <Video className="w-5 h-5 mr-2" />
                    Buat Video
                  </>
                )}
              </Button>
            )}

            <ScriptPicker
              open={bankPickerOpen}
              onOpenChange={setBankPickerOpen}
              onSelect={(s) => setSelectedScript(s)}
            />
          </div>
        )}

        {step === 'pick-idea' && (
          <IdeaPicker
            ideas={ideas}
            regenerating={generatingIdeas}
            picking={picking}
            onRegenerate={handleGenerateIdeas}
            onPick={handlePickIdea}
            onBack={() => setStep('input')}
          />
        )}

        {step === 'edit-clips' && (
          <ClipEditor
            productNotes={productNotes}
            onProductNotesChange={setProductNotes}
            styleNotes={styleNotes}
            onStyleNotesChange={setStyleNotes}
            clips={clips}
            onClipsChange={setClips}
            productPreview={productImage}
            aspectRatio={aspectRatio}
            submitting={submittingVideo}
            onSubmit={handleSubmitVideo}
            onBack={() => setStep('pick-idea')}
          />
        )}

        {error && step !== 'input' && (
          <div className="mt-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Memuat...</div>}>
      <StudioPageInner />
    </Suspense>
  );
}
