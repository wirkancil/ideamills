export interface VoicePreset {
  id: string;
  label: string;
  description: string;
}

export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: 'remaja-ceria',
    label: 'Remaja ceria',
    description: 'Bright cheerful young female voice, 16-year-old Indonesian, playful innocent tone, fast excited pace, school-age energy',
  },
  {
    id: 'mahasiswi-genz',
    label: 'Mahasiswi Gen Z',
    description: 'Bright youthful female voice, 20-year-old Indonesian, Jakarta accent, trendy upbeat tone, casual slang-friendly, fast pace',
  },
  {
    id: 'influencer-trendy',
    label: 'Influencer trendy',
    description: 'Bright social-media-style female voice, 22-year-old Indonesian, Jakarta accent, expressive enthusiastic tone, fast pace, slight vocal fry',
  },
  {
    id: 'wanita-muda-energik',
    label: 'Wanita muda energik',
    description: 'Bright energetic female voice, 24-year-old Indonesian, Jakarta accent, casual upbeat tone, medium pace, friendly and approachable',
  },
  {
    id: 'beauty-advisor',
    label: 'Beauty advisor',
    description: 'Smooth confident female voice, 26-year-old Indonesian, neutral accent, articulate product-knowledgeable tone, medium pace, polished delivery',
  },
  {
    id: 'mc-acara',
    label: 'MC acara',
    description: 'Lively energetic female voice, 27-year-old Indonesian, Jakarta accent, animated enthusiastic tone, fast vibrant pace',
  },
  {
    id: 'sales-friendly',
    label: 'Sales friendly',
    description: 'Warm persuasive female voice, 28-year-old Indonesian, neutral accent, confident yet approachable tone, medium pace, trust-building delivery',
  },
  {
    id: 'host-podcast',
    label: 'Host podcast',
    description: 'Smooth conversational female voice, 29-year-old Indonesian, neutral accent, casual articulate tone, natural pace with thoughtful pauses',
  },
  {
    id: 'wanita-karir',
    label: 'Wanita karir',
    description: 'Confident professional female voice, 30-year-old Indonesian, neutral accent, articulate poised tone, medium pace',
  },
  {
    id: 'ibu-muda-ramah',
    label: 'Ibu muda ramah',
    description: 'Warm caring female voice, 32-year-old Indonesian, soft genuine tone, slight smile in voice, medium pace, approachable and trustworthy',
  },
];
