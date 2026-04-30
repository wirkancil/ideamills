'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { TopBar } from '@/app/components/TopBar';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { ScriptCard } from '@/app/components/ScriptCard';
import { TagFilterPills } from '@/app/components/TagFilterPills';
import type { ScriptLibraryListItem } from '@/app/lib/types';

export default function ScriptsListPage() {
  const [scripts, setScripts] = useState<ScriptLibraryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<'recent' | 'alpha'>('recent');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    selectedTags.forEach((t) => params.append('tag', t));
    params.set('sort', sort);
    fetch(`/api/scripts?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setScripts(data.items ?? []))
      .catch(() => setScripts([]))
      .finally(() => setLoading(false));
  }, [query, selectedTags, sort]);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/scripts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setScripts((prev) => prev.filter((s) => s._id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Gagal menghapus script');
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Script Bank</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Simpan dan re-use prompt video iklan kamu.
            </p>
          </div>
          <Link href="/scripts/new">
            <Button size="lg">
              <Plus className="w-4 h-4 mr-2" />
              Buat Script
            </Button>
          </Link>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari script..."
                className="pl-9"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as 'recent' | 'alpha')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Terbaru</SelectItem>
                <SelectItem value="alpha">Alphabetical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <TagFilterPills selectedTags={selectedTags} onChange={setSelectedTags} />
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border-2 rounded-xl p-4 h-40 animate-pulse bg-muted/30" />
            ))}
          </div>
        )}

        {!loading && scripts.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <p className="text-muted-foreground">
              {query || selectedTags.length > 0
                ? 'Tidak ada script yang cocok'
                : 'Belum ada script di bank. Buat yang pertama!'}
            </p>
            {!(query || selectedTags.length > 0) && (
              <Link href="/scripts/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Buat Script Pertama
                </Button>
              </Link>
            )}
          </div>
        )}

        {!loading && scripts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {scripts.map((script) => (
              <ScriptCard
                key={script._id}
                script={script}
                variant="full"
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
