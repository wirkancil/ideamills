'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export interface TagFilterPillsProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
}

export function TagFilterPills({ selectedTags, onChange }: TagFilterPillsProps) {
  const [allTags, setAllTags] = useState<Array<{ name: string; count: number }>>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch('/api/scripts/tags')
      .then((r) => r.json())
      .then((data) => setAllTags(data.tags ?? []))
      .catch(() => setAllTags([]));
  }, []);

  const visibleTags = showAll ? allTags : allTags.slice(0, 10);

  function toggleTag(name: string) {
    if (selectedTags.includes(name)) {
      onChange(selectedTags.filter((t) => t !== name));
    } else {
      onChange([...selectedTags, name]);
    }
  }

  if (allTags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visibleTags.map((tag) => {
        const active = selectedTags.includes(tag.name);
        return (
          <button
            key={tag.name}
            type="button"
            onClick={() => toggleTag(tag.name)}
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {tag.name}
            {active && <X className="w-3 h-3" />}
            {!active && <span className="opacity-60">({tag.count})</span>}
          </button>
        );
      })}
      {!showAll && allTags.length > 10 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs text-muted-foreground hover:text-foreground px-2.5 py-1"
        >
          + {allTags.length - 10} more
        </button>
      )}
    </div>
  );
}
