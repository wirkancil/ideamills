'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

function normalizeTag(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 50);
}

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  max?: number;
  placeholder?: string;
  suggestions?: string[];
}

export function TagInput({ value, onChange, max = 10, placeholder = 'Tambah tag...', suggestions = [] }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = suggestions
    .filter((s) => !value.includes(s) && s.startsWith(draft.toLowerCase()))
    .slice(0, 8);

  function addTag(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag) return;
    if (value.includes(tag)) return;
    if (value.length >= max) return;
    onChange([...value, tag]);
    setDraft('');
  }

  function removeTag(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) addTag(draft);
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      removeTag(value.length - 1);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 border rounded-md px-2 py-1.5 min-h-[40px] focus-within:ring-2 focus-within:ring-primary">
        {value.map((tag, idx) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(idx)}
              className="hover:text-primary/70"
              aria-label={`Remove ${tag}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {value.length < max && (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 outline-none bg-transparent text-sm min-w-[100px]"
          />
        )}
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                addTag(s);
                setShowSuggestions(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="text-xs text-muted-foreground mt-1">
        {value.length}/{max} tags
      </div>
    </div>
  );
}
