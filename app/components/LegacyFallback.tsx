'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Trash2, AlertTriangle } from 'lucide-react';

interface LegacyFallbackProps {
  generationId: string;
  productIdentifier?: string;
  creativeIdeaTitle?: string;
}

export function LegacyFallback({ generationId, productIdentifier, creativeIdeaTitle }: LegacyFallbackProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Hapus generation lama "${creativeIdeaTitle ?? productIdentifier ?? generationId}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/generations/${generationId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Gagal hapus: ${err.error ?? res.statusText}`);
      } else {
        router.push('/history');
      }
    } catch (err) {
      alert(`Gagal hapus: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="font-semibold">Generation versi lama</h3>
            <p className="text-sm text-muted-foreground">
              Generation ini dibuat dengan flow lama (Hook/Problem/Solution/CTA) yang sudah tidak compatible
              dengan editor baru. Tidak ada migrasi otomatis — hapus dan buat ulang di Studio.
            </p>
            <p className="text-xs text-muted-foreground">
              {productIdentifier && (
                <>
                  Produk: <strong>{productIdentifier}</strong>.{' '}
                </>
              )}
              {creativeIdeaTitle && (
                <>
                  Ide: <strong>{creativeIdeaTitle}</strong>.
                </>
              )}
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
          <Trash2 className="w-4 h-4 mr-2" />
          {deleting ? 'Menghapus...' : 'Hapus Generation Ini'}
        </Button>
      </CardContent>
    </Card>
  );
}
