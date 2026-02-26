// /app/lib/types.ts
export type Engine = 'gpt-5.2' | 'gemini-2.5-flash';

export interface GenerationRequest {
  productImageUrl: string;       // signed URL, not base64
  modelImageUrl?: string | null; // signed URL or null
  basicIdea: string;
  engine: Engine;
  visualOverrides?: string | null;
  enhancedPrompt?: string;       // For enhanced flow
  storyboardCount?: number;      // Optional storyboard count
}

export interface EnhancedGenerationRequest extends GenerationRequest {
  enhancedPrompt: string;        // Required for enhanced flow
}

export type SceneType = 'Hook' | 'Problem' | 'Solution' | 'CTA';

export interface Scene {
  struktur: SceneType;
  naskah_vo: string;
  visual_idea: string;
  text_to_image?: string; // L5
  image_to_video?: string; // L5
}

export interface Variation {
  id: string;          // var_001..var_100
  theme: string;
  directors_script?: any;
  scenes: Scene[];     // 3–4 scenes
}

export interface GenerationResponse { 
  variations: Variation[] 
}

export interface GenerationStatus {
  id: string;
  status: 'queued' | 'running' | 'processing' | 'partial' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  engine: Engine;
  productIdentifier?: string;
  counts?: {
    themes: number;
    scripts: number;
    variations: number;
  };
  themeCounts?: Record<string, number>; // Theme name -> script count
  error?: string;
  createdAt: string;
}

// Vision output types
export interface ProductDescription {
  brand?: string;
  form_factor: string;
  colorway?: string;  // Made optional for enhanced flow
  color_scheme?: string; // Alternative to colorway
  key_benefit: string;
  category: string;
  notable_text?: string;
  style?: string;
  target_audience?: string;
  ingredients?: string;
  additional_notes?: string;
}

export interface ModelDescription {
  age_range?: string;
  gender?: string;
  ethnicity?: string;
  appearance?: string;
  style?: string;
  source: 'vision' | 'generic';
}

// Database types
export interface DBGeneration {
  id: string;
  idempotency_key: string;
  tenant_id?: string;
  product_identifier: string;
  model_identifier?: string;
  engine: Engine;
  overrides?: string;
  status: string;
  progress: number;
  error?: string;
  created_at: string;
}

export interface DBScript {
  id: string;
  generation_id: string;
  theme: string;
  idx: number;
  structure: any;
  model_used: string;
  token_in: number;
  token_out: number;
  latency_ms: number;
  created_at: string;
}

export interface DBScene {
  id: string;
  script_id: string;
  order: number;
  struktur: SceneType;
  naskah_vo: string;
  visual_idea: string;
  text_to_image?: string;
  image_to_video?: string;
  created_at: string;
}

