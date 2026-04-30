'use client';

import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Sparkles } from 'lucide-react';

interface StyleNotesFieldProps {
  value: string;
  onChange: (v: string) => void;
}

export function StyleNotesField({ value, onChange }: StyleNotesFieldProps) {
  return (
    <div className="space-y-2 border-2 border-dashed rounded-2xl p-4 bg-muted/30">
      <Label className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        Style Notes
        <span className="text-xs text-muted-foreground font-normal">
          (auto-fill, di-prepend ke setiap clip prompt)
        </span>
      </Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Produk: ... Model: ... Tone: ..."
        rows={4}
        className="text-sm"
        maxLength={1500}
      />
      <p className="text-[10px] text-right text-muted-foreground">{value.length} / 1500</p>
    </div>
  );
}
