// /app/lib/types.ts
export type JobType = 'standard' | 'structured';

export interface GenerationRequest {
  productImageUrl: string;
  modelImageUrl?: string | null;
  basicIdea: string;
  visualOverrides?: string | null;
  enhancedPrompt?: string;
  storyboardCount?: number;
}

export interface EnhancedGenerationRequest extends GenerationRequest {
  enhancedPrompt: string;
}

// Structured payload stored in JobQueue — replaces the loose string-based enhanced flow
export interface GenerationJobPayload {
  productImageUrl: string;
  modelImageUrl?: string | null;
  basicIdea: string;
  storyboardCount: number;
  job_type?: JobType;
  // Structured context from UI steps (avoids re-parsing from string)
  product?: Record<string, unknown>;
  model?: Record<string, unknown> | null;
  creativeIdea?: {
    title: string;
    concept: string;
    storyline: string;
    key_message?: string;
    why_effective?: string;
  };
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
  directors_script?: string;
  scenes: Scene[];     // 3–4 scenes
}

export interface GenerationResponse { 
  variations: Variation[] 
}

export interface GenerationStatus {
  id: string;
  status: 'queued' | 'running' | 'processing' | 'partial' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  progressLabel?: string;
  engine?: string;
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

// Database types — reflect actual MongoDB documents
export interface DBGeneration {
  _id: string;
  idempotency_key?: string;
  product_identifier: string;
  model_identifier?: string;
  creative_idea_title?: string;
  product_image_url?: string;
  model_image_url?: string | null;
  overrides?: string | null;
  modelConfig?: Record<string, unknown>;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
  progress: number;
  progress_label?: string;
  error_message?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DBScript {
  _id: string;
  generation_id: string;
  idea_id: string;
  theme: string;
  idx: number;
  directors_script?: string;
  created_at: Date;
}

export interface DBScene {
  _id: string;
  script_id: string;
  order: number;
  struktur: SceneType;
  naskah_vo: string;
  visual_idea: string;
  text_to_image?: string | null;
  image_to_video?: string | null;
  image_status: AssetStatus;
  video_status: AssetStatus;
  image_source: 'ai' | 'user' | null;
  image_error: string | null;
  video_error: string | null;
  generated_image_path?: string | null;
  generated_video_path?: string | null;
  created_at: Date;
  updated_at?: Date;
}

export type AssetStatus = 'pending' | 'queued' | 'generating' | 'done' | 'failed';

export interface SceneAssetState {
  id: string;
  scriptId: string;
  order: number;
  struktur: SceneType;
  naskah_vo: string;
  visual_idea: string;
  text_to_image: string;
  image_to_video: string;
  image_status: AssetStatus;
  image_source: 'ai' | 'user' | null;
  image_url: string | null;
  image_error: string | null;
  video_status: AssetStatus;
  video_url: string | null;
  video_error: string | null;
}

