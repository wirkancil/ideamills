'use client';

import { Button } from '@/app/components/ui/button';
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';
import type { Idea } from '@/app/lib/types';

interface IdeaPickerProps {
  ideas: Idea[];
  regenerating: boolean;
  picking: boolean;
  onRegenerate: () => void;
  onPick: (index: number) => void;
  onBack: () => void;
}

export function IdeaPicker({ ideas, regenerating, picking, onRegenerate, onPick, onBack }: IdeaPickerProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>
      </div>

      <div>
        <h2 className="text-xl font-bold">Pilih Ide Iklan</h2>
        <p className="text-sm text-muted-foreground mt-1">
          AI generate {ideas.length} ide. Pilih salah satu untuk lanjut ke editor clip.
        </p>
      </div>

      <div className="space-y-3">
        {ideas.map((idea, idx) => (
          <div
            key={idx}
            className={`border-2 rounded-xl p-4 hover:border-primary transition-colors ${
              picking ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <h3 className="font-semibold text-sm mb-2">[{idx + 1}] {idea.title}</h3>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{idea.content}</p>
            <Button size="sm" onClick={() => onPick(idx)} disabled={picking}>
              {picking ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Menyiapkan...
                </>
              ) : (
                'Pilih Ide Ini →'
              )}
            </Button>
          </div>
        ))}
      </div>

      <Button variant="outline" size="lg" className="w-full" onClick={onRegenerate} disabled={regenerating || picking}>
        {regenerating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Generate ide baru...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            Generate Ide Baru
          </>
        )}
      </Button>
    </div>
  );
}
