'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { TopBar } from '@/app/components/TopBar';
import { ScriptForm, type ScriptFormSubmitData } from '@/app/components/ScriptForm';

export default function ScriptNewPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(data: ScriptFormSubmitData) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Gagal menyimpan script');
        setSubmitting(false);
        return;
      }
      router.push(`/scripts/${json.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
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

        <div className="mb-6">
          <h1 className="text-2xl font-bold">Buat Script Baru</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tulis manual atau upload doc untuk auto-fill content.
          </p>
        </div>

        <ScriptForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={() => router.push('/scripts')}
          submitting={submitting}
        />
      </div>
    </div>
  );
}
