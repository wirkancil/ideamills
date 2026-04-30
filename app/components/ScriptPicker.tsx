'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { ScriptCard } from './ScriptCard';
import { TagFilterPills } from './TagFilterPills';
import type { DBScriptLibrary, ScriptLibraryListItem } from '@/app/lib/types';

export interface ScriptPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (script: DBScriptLibrary) => void;
}

export function ScriptPicker({ open, onOpenChange, onSelect }: ScriptPickerProps) {
  const [scripts, setScripts] = useState<ScriptLibraryListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [fetchingDetail, setFetchingDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    selectedTags.forEach((t) => params.append('tag', t));
    fetch(`/api/scripts?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setScripts(data.items ?? []))
      .catch(() => setScripts([]))
      .finally(() => setLoading(false));
  }, [open, query, selectedTags]);

  async function handleSelect(id: string) {
    setFetchingDetail(id);
    try {
      const res = await fetch(`/api/scripts/${id}`);
      const data = await res.json();
      if (res.ok && data.script) {
        onSelect(data.script as DBScriptLibrary);
        onOpenChange(false);
      }
    } catch {
      // ignore
    } finally {
      setFetchingDetail(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Pilih Script dari Bank</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari script..."
              className="pl-9"
            />
          </div>
          <TagFilterPills selectedTags={selectedTags} onChange={setSelectedTags} />
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {loading && (
            <div className="text-center py-12 text-sm text-muted-foreground">Memuat...</div>
          )}
          {!loading && scripts.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {query || selectedTags.length > 0
                  ? 'Tidak ada script yang cocok'
                  : 'Belum ada script di bank'}
              </p>
              <Link
                href="/scripts/new"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                onClick={() => onOpenChange(false)}
              >
                <Plus className="w-4 h-4" />
                Buat sekarang
              </Link>
            </div>
          )}
          {!loading && scripts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
              {scripts.map((script) => (
                <ScriptCard
                  key={script._id}
                  script={script}
                  variant="compact"
                  onClick={() => handleSelect(script._id)}
                />
              ))}
            </div>
          )}
          {fetchingDetail && (
            <div className="text-center py-2 text-xs text-muted-foreground">Memuat script...</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
