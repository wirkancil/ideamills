'use client';

import Link from 'next/link';
import { MoreVertical, Edit, Trash2, FileText, Upload } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import type { ScriptLibraryListItem } from '@/app/lib/types';

function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'baru saja';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} bulan lalu`;
  return `${Math.floor(months / 12)} tahun lalu`;
}

export interface ScriptCardProps {
  script: ScriptLibraryListItem;
  variant?: 'full' | 'compact';
  onClick?: () => void;
  onDelete?: (id: string) => void;
}

export function ScriptCard({ script, variant = 'full', onClick, onDelete }: ScriptCardProps) {
  const visibleTags = script.tags.slice(0, 3);
  const remainingTags = script.tags.length - visibleTags.length;

  const inner = (
    <div className="border-2 rounded-xl p-4 hover:border-primary transition-colors h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-base line-clamp-1 flex-1">{script.title}</h3>
        {variant === 'full' && onDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="p-1 hover:bg-muted rounded"
              aria-label="Menu"
            >
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/scripts/${script._id}`} className="flex items-center gap-2 cursor-pointer">
                  <Edit className="w-4 h-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  if (confirm(`Hapus "${script.title}"? Tidak bisa di-undo.`)) {
                    onDelete(script._id);
                  }
                }}
                className="text-destructive flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {visibleTags.map((tag) => (
          <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
            #{tag}
          </span>
        ))}
        {remainingTags > 0 && (
          <span className="text-xs text-muted-foreground">+{remainingTags} more</span>
        )}
      </div>
      <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {script.source === 'upload' ? (
            <Upload className="w-3 h-3" />
          ) : (
            <FileText className="w-3 h-3" />
          )}
          {script.source === 'upload' ? 'upload' : 'manual'}
        </span>
        <span>•</span>
        <span>{timeAgo(script.updated_at)}</span>
      </div>
    </div>
  );

  if (variant === 'compact' || onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left w-full">
        {inner}
      </button>
    );
  }

  return (
    <Link href={`/scripts/${script._id}`} className="block">
      {inner}
    </Link>
  );
}
