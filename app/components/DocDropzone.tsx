'use client';

import { useState, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';

const ACCEPTED_MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
];
const ACCEPTED_EXT = '.docx,.txt,.md';
const MAX_BYTES = 5 * 1024 * 1024;

function isAcceptable(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_BYTES) return { ok: false, error: 'File terlalu besar (max 5MB)' };
  if (!ACCEPTED_MIMES.includes(file.type)) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['docx', 'txt', 'md'].includes(ext ?? '')) {
      return { ok: false, error: 'Format file tidak didukung. Gunakan .docx, .txt, atau .md' };
    }
  }
  return { ok: true };
}

export interface DocDropzoneProps {
  onExtract: (content: string, warning?: string) => void;
  disabled?: boolean;
}

export function DocDropzone({ onExtract, disabled = false }: DocDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const check = isAcceptable(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/scripts/extract', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal extract');
        return;
      }
      onExtract(data.content, data.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          if (disabled || uploading) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
          disabled || uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary'
        } ${dragOver ? 'border-primary bg-primary/5' : ''}`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Mengupload & extract...
          </div>
        ) : (
          <>
            <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm font-medium">Drag & drop atau klik untuk upload doc</p>
            <p className="text-xs text-muted-foreground mt-0.5">.docx, .txt, .md (max 5MB)</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
