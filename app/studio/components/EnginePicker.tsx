'use client';

import { Label } from '@/app/components/ui/label';
import { Settings } from 'lucide-react';

// Model IDs follow OpenRouter format: provider/model
export const TEXT_MODEL_OPTIONS = [
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (cepat & murah) ⭐' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2 (murah)' },
  { id: 'z-ai/glm-4.6:free', label: 'GLM 4.6 (gratis, rate-limited)' },
  { id: 'x-ai/grok-4', label: 'Grok 4' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'openai/gpt-5', label: 'GPT-5' },
] as const;

export const VISION_MODEL_OPTIONS = [
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (cepat & murah) ⭐' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (lebih akurat untuk text label)' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6 (paling kuat reasoning)' },
  { id: 'openai/gpt-5', label: 'GPT-5' },
] as const;

export const VEO_MODEL_OPTIONS = [
  { id: 'veo-3.1-fast', label: 'Veo 3.1 fast (cepat, default)' },
  { id: 'veo-3.1-quality', label: 'Veo 3.1 quality (lebih lambat, hasil lebih baik)' },
] as const;

export const ASPECT_RATIO_OPTIONS = [
  { id: 'landscape', label: 'Landscape (16:9, YouTube/Instagram Reels)' },
  { id: 'portrait', label: 'Portrait (9:16, TikTok/Instagram Stories/Shorts)' },
] as const;

export type TextModelId = typeof TEXT_MODEL_OPTIONS[number]['id'];
export type VisionModelId = typeof VISION_MODEL_OPTIONS[number]['id'];
export type VeoModelId = typeof VEO_MODEL_OPTIONS[number]['id'];
export type AspectRatio = typeof ASPECT_RATIO_OPTIONS[number]['id'];

export const DEFAULT_TEXT_MODEL: TextModelId = 'google/gemini-2.5-flash';
export const DEFAULT_VISION_MODEL: VisionModelId = 'google/gemini-2.5-flash';
export const DEFAULT_VEO_MODEL: VeoModelId = 'veo-3.1-fast';
export const DEFAULT_ASPECT_RATIO: AspectRatio = 'portrait';

interface EnginePickerProps {
  textModel: TextModelId;
  visionModel: VisionModelId;
  veoModel: VeoModelId;
  aspectRatio: AspectRatio;
  onTextModelChange: (id: TextModelId) => void;
  onVisionModelChange: (id: VisionModelId) => void;
  onVeoModelChange: (id: VeoModelId) => void;
  onAspectRatioChange: (id: AspectRatio) => void;
}

export function EnginePicker({
  textModel,
  visionModel,
  veoModel,
  aspectRatio,
  onTextModelChange,
  onVisionModelChange,
  onVeoModelChange,
  onAspectRatioChange,
}: EnginePickerProps) {
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
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]">Vision (analyze foto)</Label>
          <select
            value={visionModel}
            onChange={(e) => onVisionModelChange(e.target.value as VisionModelId)}
            className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
          >
            {VISION_MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
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

        <div className="space-y-1 sm:col-span-2">
          <Label className="text-[11px]">Aspect Ratio (orientasi video)</Label>
          <select
            value={aspectRatio}
            onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
            className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
          >
            {ASPECT_RATIO_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
