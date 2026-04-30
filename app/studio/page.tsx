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
  DEFAULT_VEO_MODEL,
  type TextModelId,
  type VeoModelId,
} from './components/EnginePicker';
import { ScriptPicker } from '@/app/components/ScriptPicker';
import { Button } from '@/app/components/ui/button';
import { Loader2, Video, BookOpen } from 'lucide-react';
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
  const [veoModel, setVeoModel] = useState<VeoModelId>(DEFAULT_VEO_MODEL);

  // Cross-step state
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [styleNotes, setStyleNotes] = useState('');
  const [clips, setClips] = useState<ClipDraft[]>([]);

  // Quick mode state
  const [selectedScript, setSelectedScript] = useState<DBScriptLibrary | null>(null);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);

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
          veoModel,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
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
          styleNotes,
          clips: clips.map((c) => ({
            index: c.index,
            prompt: c.prompt,
            imageMode: c.imageMode,
            imageDataUrl: c.imageMode === 'override' ? c.imageDataUrl : null,
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
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
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
              veoModel={veoModel}
              onTextModelChange={setTextModel}
              onVeoModelChange={setVeoModel}
            />

            {mode === 'quick' && (
              <div className="space-y-2 border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Script Bank</span>
                  <Button variant="outline" size="sm" onClick={() => setBankPickerOpen(true)}>
                    <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                    {selectedScript ? 'Ganti Script' : 'Pilih Script'}
                  </Button>
                </div>
                {selectedScript ? (
                  <div className="text-xs space-y-1 bg-muted/30 rounded-lg p-3">
                    <p className="font-semibold">{selectedScript.title}</p>
                    <p className="text-muted-foreground line-clamp-3 leading-relaxed">{selectedScript.content}</p>
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
            styleNotes={styleNotes}
            onStyleNotesChange={setStyleNotes}
            clips={clips}
            onClipsChange={setClips}
            productPreview={productImage}
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
