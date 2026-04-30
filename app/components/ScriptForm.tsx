'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { TagInput } from './TagInput';
import { DocDropzone } from './DocDropzone';
import type { DBScriptLibrary } from '@/app/lib/types';

export type ScriptFormMode = 'create' | 'edit';

export interface ScriptFormSubmitData {
  title: string;
  tags: string[];
  content: string;
  source: 'manual' | 'upload';
}

export interface ScriptFormProps {
  mode: ScriptFormMode;
  initialData?: Partial<DBScriptLibrary>;
  onSubmit: (data: ScriptFormSubmitData) => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
}

const TITLE_MAX = 200;
const CONTENT_MAX = 5000;

export function ScriptForm({ mode, initialData, onSubmit, onCancel, submitting = false }: ScriptFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);
  const [content, setContent] = useState(initialData?.content ?? '');
  const [source, setSource] = useState<'manual' | 'upload'>(initialData?.source ?? 'manual');
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/scripts/tags')
      .then((r) => r.json())
      .then((data) => {
        setTagSuggestions((data.tags ?? []).map((t: { name: string }) => t.name));
      })
      .catch(() => {});
  }, []);

  const isValid =
    title.trim().length > 0 &&
    title.length <= TITLE_MAX &&
    content.trim().length > 0 &&
    content.length <= CONTENT_MAX;

  async function handleSubmit() {
    if (!isValid) return;
    await onSubmit({
      title: title.trim(),
      tags,
      content: content.trim(),
      source,
    });
  }

  function handleExtract(extractedContent: string, warning?: string) {
    setContent(extractedContent);
    setSource('upload');
    setUploadWarning(warning ?? null);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
          placeholder="Contoh: Iklan Skincare Monolog Glow Booster"
          maxLength={TITLE_MAX}
        />
        <div className="text-xs text-muted-foreground text-right">{title.length}/{TITLE_MAX}</div>
      </div>

      <div className="space-y-2">
        <Label>
          Tags <span className="text-muted-foreground text-xs">(optional, max 10)</span>
        </Label>
        <TagInput
          value={tags}
          onChange={setTags}
          max={10}
          suggestions={tagSuggestions}
          placeholder="skincare, monolog, ramadan..."
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>
            Content <span className="text-destructive">*</span>{' '}
            <span className="text-muted-foreground text-xs">(prompt video utuh)</span>
          </Label>
          {source === 'upload' && (
            <span className="text-xs text-primary">📤 Dari upload</span>
          )}
        </div>

        {mode === 'create' && (
          <DocDropzone onExtract={handleExtract} disabled={submitting} />
        )}

        <Textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value.slice(0, CONTENT_MAX));
          }}
          placeholder={
            mode === 'create'
              ? 'Tulis prompt video kamu di sini, atau upload doc di atas untuk auto-fill...'
              : 'Edit prompt video...'
          }
          rows={14}
          maxLength={CONTENT_MAX}
          className="font-mono text-sm resize-none"
        />
        <div className="flex items-center justify-between">
          {uploadWarning ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">{uploadWarning}</span>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">{content.length}/{CONTENT_MAX}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          size="lg"
          className="flex-1"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Menyimpan...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save
            </>
          )}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
