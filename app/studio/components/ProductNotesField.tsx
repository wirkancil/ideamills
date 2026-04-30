'use client';

import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Package } from 'lucide-react';

interface ProductNotesFieldProps {
  value: string;
  onChange: (v: string) => void;
}

export function ProductNotesField({ value, onChange }: ProductNotesFieldProps) {
  return (
    <div className="space-y-2 border-2 border-dashed rounded-2xl p-4 bg-muted/30">
      <Label className="flex items-center gap-2">
        <Package className="w-4 h-4 text-primary" />
        Product Detail
        <span className="text-xs text-muted-foreground font-normal">
          (nama brand, bentuk produk, warna kemasan)
        </span>
      </Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Contoh: GlowBooster 7 Active Ingredients, botol serum dropper kaca bening, tutup putih, label 'GlowBooster' warna hitam dengan angka '7' merah/oranye besar..."
        rows={3}
        className="text-sm"
        maxLength={2000}
      />
      <p className="text-[10px] text-right text-muted-foreground">{value.length} / 2000</p>
    </div>
  );
}
