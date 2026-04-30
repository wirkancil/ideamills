'use client';

import { Label } from '@/app/components/ui/label';
import { Settings } from 'lucide-react';

export const TEXT_MODEL_OPTIONS = [
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (cepat & murah)' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
  { id: 'x-ai/grok-2-1212', label: 'Grok 2' },
  { id: 'openai/gpt-5', label: 'GPT-5' },
] as const;

export const VEO_MODEL_OPTIONS = [
  { id: 'veo-3.1-fast', label: 'Veo 3.1 fast (cepat, default)' },
  { id: 'veo-3.1-quality', label: 'Veo 3.1 quality (lebih lambat, hasil lebih baik)' },
] as const;

export type TextModelId = typeof TEXT_MODEL_OPTIONS[number]['id'];
export type VeoModelId = typeof VEO_MODEL_OPTIONS[number]['id'];

export const DEFAULT_TEXT_MODEL: TextModelId = 'anthropic/claude-sonnet-4.6';
export const DEFAULT_VEO_MODEL: VeoModelId = 'veo-3.1-fast';

interface EnginePickerProps {
  textModel: TextModelId;
  veoModel: VeoModelId;
  onTextModelChange: (id: TextModelId) => void;
  onVeoModelChange: (id: VeoModelId) => void;
}

export function EnginePicker({ textModel, veoModel, onTextModelChange, onVeoModelChange }: EnginePickerProps) {
  return (
    <div className="border rounded-xl p-3 space-y-3 bg-muted/20">
      <div className="flex items-center gap-2">
        <Settings className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Pengaturan Engine</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px]">LLM (ide & script)</Label>
          <select
            value={textModel}
            onChange={(e) => onTextModelChange(e.target.value as TextModelId)}
            className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
          >
            {TEXT_MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <p className="text-[10px] text-muted-foreground">
            Vision (analyze foto) selalu pakai Gemini.
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]">Veo Model (video)</Label>
          <select
            value={veoModel}
            onChange={(e) => onVeoModelChange(e.target.value as VeoModelId)}
            className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
          >
            {VEO_MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
