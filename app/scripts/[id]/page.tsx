'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Clapperboard, MoreVertical, Trash2, Loader2 } from 'lucide-react';
import { TopBar } from '@/app/components/TopBar';
import { Button } from '@/app/components/ui/button';
import { ScriptForm, type ScriptFormSubmitData } from '@/app/components/ScriptForm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import type { DBScriptLibrary } from '@/app/lib/types';

export default function ScriptDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [script, setScript] = useState<DBScriptLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/scripts/${id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || 'Gagal memuat script');
          return;
        }
        setScript(data.script);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Network error'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave(data: ScriptFormSubmitData) {
    if (!id) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/scripts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          tags: data.tags,
          content: data.content,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Gagal update');
        setSubmitting(false);
        return;
      }
      setScript(json.script);
      alert('Script berhasil disimpan');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!id || !script) return;
    if (!confirm(`Hapus "${script.title}"? Tidak bisa di-undo.`)) return;
    const res = await fetch(`/api/scripts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/scripts');
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Gagal menghapus');
    }
  }

  function handleUseInStudio() {
    if (!id) return;
    router.push(`/studio?mode=quick&scriptId=${id}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="container mx-auto px-4 py-12 max-w-3xl text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !script) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="container mx-auto px-4 py-12 max-w-3xl">
          <p className="text-destructive">{error || 'Script tidak ditemukan'}</p>
          <button
            type="button"
            onClick={() => router.push('/scripts')}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Kembali ke Script Bank
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <button
          type="button"
          onClick={() => router.push('/scripts')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Script Bank
        </button>

        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">{script.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Source: {script.source} • {script.content.length} karakter
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleUseInStudio}>
              <Clapperboard className="w-4 h-4 mr-2" />
              Use in Studio
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger className="p-2 hover:bg-muted rounded-md">
                <MoreVertical className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus Script
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ScriptForm
          mode="edit"
          initialData={script}
          onSubmit={handleSave}
          submitting={submitting}
        />
      </div>
    </div>
  );
}
