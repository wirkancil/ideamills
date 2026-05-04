'use client';

import { VOICE_PRESETS } from '@/app/lib/voicePresets';

interface VoiceProfilePickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function VoiceProfilePicker({ value, onChange }: VoiceProfilePickerProps) {
  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = VOICE_PRESETS.find((p) => p.id === e.target.value);
    if (preset) onChange(preset.description);
    else onChange('');
  };

  const selectedPresetId = VOICE_PRESETS.find((p) => p.description === value)?.id ?? '';

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Voice Profile</label>
      <select
        value={selectedPresetId}
        onChange={handlePresetChange}
        className="w-full text-sm border rounded-lg px-3 py-2 bg-background"
      >
        <option value="">— Pilih preset atau tulis sendiri —</option>
        {VOICE_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Contoh: warm caring female voice, 32-year-old Indonesian, soft genuine tone, medium pace"
        maxLength={500}
        rows={2}
        className="w-full text-xs border rounded-lg px-3 py-2 bg-background resize-none placeholder:text-muted-foreground"
      />
      <p className="text-[10px] text-muted-foreground text-right">{value.length} / 500</p>
    </div>
  );
}
