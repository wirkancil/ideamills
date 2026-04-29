'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/app/components/TopBar';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Upload, Video, Plus, Trash2, Loader2, X, Sparkles, FolderOpen, ArrowLeft } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = null | 'pipeline' | 'assets';

interface SceneInput {
  id: string;
  narasi: string;
  imageDataUrl: string | null;
  imagePreview: string | null;
}

function newScene(): SceneInput {
  return { id: Math.random().toString(36).slice(2), narasi: '', imageDataUrl: null, imagePreview: null };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const [mode, setMode] = useState<Mode>(null);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      {mode === null && <LandingView onSelect={setMode} />}
      {mode === 'pipeline' && <PipelineForm onBack={() => setMode(null)} />}
      {mode === 'assets' && <AssetsForm onBack={() => setMode(null)} />}
    </div>
  );
}

// ─── Landing: pilih mode ──────────────────────────────────────────────────────

function LandingView({ onSelect }: { onSelect: (m: Mode) => void }) {
  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold">Buat Video Iklan</h1>
        <p className="text-muted-foreground mt-2">Pilih sesuai apa yang kamu punya sekarang.</p>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-2 gap-4 mb-12">
        <button
          type="button"
          onClick={() => onSelect('pipeline')}
          className="group border-2 rounded-2xl p-6 text-left hover:border-primary hover:bg-primary/5 transition-all space-y-3"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-base">Dari Nol</p>
            <p className="text-sm text-muted-foreground mt-1">
              Cukup upload foto produk dan ceritakan idenya. AI buatkan script, angle marketing, dan video.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {['Foto produk', 'Brief singkat', 'AI generate semua', 'Kontrol penuh'].map((s) => (
              <span key={s} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{s}</span>
            ))}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelect('assets')}
          className="group border-2 rounded-2xl p-6 text-left hover:border-primary hover:bg-primary/5 transition-all space-y-3"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <FolderOpen className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-base">Punya Aset</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sudah punya foto dan script per scene. Langsung generate video tanpa pipeline panjang.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {['Foto + script siap', 'Langsung ke video', 'Kontrol penuh'].map((s) => (
              <span key={s} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{s}</span>
            ))}
          </div>
        </button>
      </div>

      {/* Panduan */}
      <div className="border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 bg-muted/40 border-b">
          <p className="text-sm font-semibold">Panduan Penggunaan</p>
        </div>
        <div className="divide-y">
          {/* Dari Nol */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              <p className="text-sm font-medium">Dari Nol — cocok untuk kampanye baru</p>
            </div>
            <ol className="space-y-1.5 ml-8">
              {[
                'Upload foto produk (wajib) dan foto model (optional)',
                'Ceritakan produk atau ide iklan dalam 1–2 kalimat',
                'AI akan generate 20 angle marketing berbeda',
                'Pilih angle yang paling cocok',
                'AI generate script + visual untuk tiap scene',
                'Generate image dan video dari hasil script',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium mt-0.5">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Punya Aset */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <FolderOpen className="w-3.5 h-3.5 text-primary" />
              </div>
              <p className="text-sm font-medium">Punya Aset — cocok jika sudah punya materi</p>
            </div>
            <ol className="space-y-1.5 ml-8">
              {[
                'Upload foto produk dan foto model (optional)',
                'Tulis brief singkat tentang produk (optional)',
                'Tambah scene dan tulis narasi tiap scene',
                'Upload foto berbeda per scene jika diperlukan',
                'Klik Buat Video — sistem langsung generate',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium mt-0.5">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Tips */}
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tips</p>
            <ul className="space-y-1">
              {[
                'Foto produk yang jelas dan terang menghasilkan video yang lebih baik',
                'Semakin detail brief, semakin relevan angle marketing yang dihasilkan',
                'Hasil generation tersimpan di Riwayat — bisa diakses kapan saja',
                'Semua foto dan video tersimpan di tab Aset',
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="text-primary mt-0.5">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Form (Dari Nol → full L0–L5) ───────────────────────────────────

function PipelineForm({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [productDataUrl, setProductDataUrl] = useState<string | null>(null);
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const [modelDataUrl, setModelDataUrl] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productFileRef = useRef<HTMLInputElement>(null);
  const modelFileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File, setUrl: (v: string) => void, setPreview: (v: string) => void) {
    const dataUrl = await fileToDataUrl(file);
    setUrl(dataUrl);
    setPreview(dataUrl);
  }

  async function handleSubmit() {
    if (!productDataUrl) { setError('Upload foto produk dulu.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImageUrl: productDataUrl,
          modelImageUrl: modelDataUrl,
          basicIdea: brief,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Gagal memulai');
      const { generationId } = await res.json();
      router.push(`/generations/${generationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
      setSubmitting(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Kembali
      </button>

      <div className="mb-6">
        <h2 className="text-xl font-bold">Dari Nol</h2>
        <p className="text-sm text-muted-foreground mt-1">AI akan buatkan script, angle marketing, dan video dari foto produk kamu.</p>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <PhotoUpload label="Foto Produk" preview={productPreview} fileRef={productFileRef}
            onClear={() => { setProductPreview(null); setProductDataUrl(null); }}
            onFile={(f) => handleUpload(f, setProductDataUrl, setProductPreview)} />
          <PhotoUpload label="Foto Model" optional preview={modelPreview} fileRef={modelFileRef}
            onClear={() => { setModelPreview(null); setModelDataUrl(null); }}
            onFile={(f) => handleUpload(f, setModelDataUrl, setModelPreview)} />
        </div>

        <div className="space-y-2">
          <Label>Ceritakan produk atau ide iklan kamu <span className="text-muted-foreground text-sm font-normal">(optional)</span></Label>
          <Textarea
            placeholder="Contoh: skincare untuk kulit berminyak, target ibu muda 25-35 tahun, tone fresh dan energik..."
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
          />
        </div>

        {error && <ErrorBox message={error} />}

        <Button size="lg" className="w-full text-base" disabled={submitting || !productDataUrl} onClick={handleSubmit}>
          {submitting
            ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Memproses...</>
            : <><Sparkles className="w-5 h-5 mr-2" />Buat Iklan dengan AI</>}
        </Button>
        {!productDataUrl && <p className="text-xs text-muted-foreground text-center -mt-2">Upload foto produk untuk mulai.</p>}
      </div>
    </div>
  );
}

// ─── Assets Form (Punya Aset → langsung ke video) ────────────────────────────

function AssetsForm({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [productDataUrl, setProductDataUrl] = useState<string | null>(null);
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const [modelDataUrl, setModelDataUrl] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [scenes, setScenes] = useState<SceneInput[]>([newScene()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productFileRef = useRef<HTMLInputElement>(null);
  const modelFileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File, setUrl: (v: string) => void, setPreview: (v: string) => void) {
    const dataUrl = await fileToDataUrl(file);
    setUrl(dataUrl);
    setPreview(dataUrl);
  }

  async function handleSceneImage(id: string, file: File) {
    const dataUrl = await fileToDataUrl(file);
    setScenes((prev) => prev.map((s) => s.id === id ? { ...s, imageDataUrl: dataUrl, imagePreview: dataUrl } : s));
  }

  async function handleSubmit() {
    if (!productDataUrl) { setError('Upload foto produk dulu.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const hasContent = scenes.some((s) => s.narasi.trim() || s.imageDataUrl);
      const res = await fetch('/api/studio/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImageUrl: productDataUrl,
          modelImageUrl: modelDataUrl,
          brief,
          scenes: hasContent
            ? scenes.map((s) => ({
                struktur: 'Scene',
                naskah_vo: s.narasi,
                text_to_image: '',
                image_to_video: s.narasi,
                imageDataUrl: s.imageDataUrl,
              }))
            : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Gagal membuat video');
      const { generationId, needsVeoPrompt } = await res.json();

      if (needsVeoPrompt) {
        await fetch('/api/studio/generate-veo-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generationId }),
        });
      }
      router.push(`/generations/${generationId}?tab=assets`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
      setSubmitting(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Kembali
      </button>

      <div className="mb-6">
        <h2 className="text-xl font-bold">Punya Aset</h2>
        <p className="text-sm text-muted-foreground mt-1">Upload foto dan tulis script per scene. Langsung generate video.</p>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <PhotoUpload label="Foto Produk" preview={productPreview} fileRef={productFileRef}
            onClear={() => { setProductPreview(null); setProductDataUrl(null); }}
            onFile={(f) => handleUpload(f, setProductDataUrl, setProductPreview)} />
          <PhotoUpload label="Foto Model" optional preview={modelPreview} fileRef={modelFileRef}
            onClear={() => { setModelPreview(null); setModelDataUrl(null); }}
            onFile={(f) => handleUpload(f, setModelDataUrl, setModelPreview)} />
        </div>

        <div className="space-y-2">
          <Label>Brief <span className="text-muted-foreground text-sm font-normal">(optional)</span></Label>
          <Textarea
            placeholder="Konteks produk, target audience, tone iklan..."
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-3">
          <div>
            <Label>Script per Scene <span className="text-muted-foreground text-sm font-normal">(optional)</span></Label>
            <p className="text-xs text-muted-foreground mt-0.5">Tulis narasi tiap scene. Kosongkan untuk auto-generate dari foto dan brief.</p>
          </div>
          {scenes.map((scene, idx) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              index={idx}
              canRemove={scenes.length > 1}
              productPreview={productPreview}
              onNarasiChange={(v) => setScenes((prev) => prev.map((s) => s.id === scene.id ? { ...s, narasi: v } : s))}
              onRemove={() => setScenes((prev) => prev.filter((s) => s.id !== scene.id))}
              onImageUpload={(file) => handleSceneImage(scene.id, file)}
            />
          ))}
          <button
            type="button"
            onClick={() => setScenes((prev) => [...prev, newScene()])}
            className="w-full border-2 border-dashed rounded-xl py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Tambah Scene
          </button>
        </div>

        {error && <ErrorBox message={error} />}

        <Button size="lg" className="w-full text-base" disabled={submitting || !productDataUrl} onClick={handleSubmit}>
          {submitting
            ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Menyiapkan...</>
            : <><Video className="w-5 h-5 mr-2" />Buat Video</>}
        </Button>
        {!productDataUrl && <p className="text-xs text-muted-foreground text-center -mt-2">Upload foto produk untuk mulai.</p>}
      </div>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function PhotoUpload({ label, optional, preview, fileRef, onClear, onFile }: {
  label: string;
  optional?: boolean;
  preview: string | null;
  fileRef: React.RefObject<HTMLInputElement>;
  onClear: () => void;
  onFile: (f: File) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label} {optional && <span className="text-muted-foreground text-sm font-normal">(optional)</span>}</Label>
      <div
        className="relative border-2 border-dashed rounded-xl cursor-pointer hover:border-primary transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={label} className="w-full h-36 object-contain rounded-xl" />
            <button type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 hover:bg-black/80">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Klik untuk upload</span>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

function SceneCard({ scene, index, canRemove, productPreview, onNarasiChange, onRemove, onImageUpload }: {
  scene: SceneInput;
  index: number;
  canRemove: boolean;
  productPreview: string | null;
  onNarasiChange: (v: string) => void;
  onRemove: () => void;
  onImageUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="border rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Scene {index + 1}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <Textarea
        value={scene.narasi}
        onChange={(e) => onNarasiChange(e.target.value)}
        placeholder="Tulis narasi, script, atau deskripsi visual untuk scene ini..."
        rows={2}
        className="text-sm resize-none"
      />
      <div className="flex items-center gap-2">
        {scene.imagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene.imagePreview} alt="scene" className="w-16 h-10 object-cover rounded-lg border" />
        ) : productPreview ? (
          <div className="flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={productPreview} alt="produk" className="w-16 h-10 object-cover rounded-lg border opacity-40" />
            <span className="text-xs text-muted-foreground">pakai foto produk</span>
          </div>
        ) : null}
        <button type="button" onClick={() => fileRef.current?.click()}
          className="text-xs text-muted-foreground hover:text-foreground border rounded-lg px-2 py-1 transition-colors flex items-center gap-1">
          <Upload className="w-3 h-3" />
          {scene.imagePreview ? 'Ganti foto' : 'Upload foto lain'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImageUpload(f); }} />
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
      {message}
    </div>
  );
}
