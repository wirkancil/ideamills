// /app/lib/types.ts

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

  // Format marker — undefined for v2 (default), 'legacy' for v1 docs
  format_version?: 'legacy';

  // Common identifiers
  product_identifier: string;
  model_identifier?: string;
  creative_idea_title?: string;
  product_image_url?: string;
  model_image_url?: string | null;
  overrides?: string | null;          // legacy v1 field
  brief?: string;                      // v2 field

  // Vision result (v2 — stored for use in expand step)
  productAnalysis?: ProductDescription;
  modelAnalysis?: ModelDescription | null;

  // Ideas (v2)
  ideas?: Idea[];
  selectedIdeaIndex?: number | null;

  // Expanded clips (v2)
  styleNotes?: string | null;
  clips?: Clip[];
  concatenated_videos?: ConcatenatedVideo[];

  modelConfig?: Record<string, unknown>;
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed' | 'canceled';
  progress: number;
  progress_label?: string;
  error_message?: string | null;
  first_frame?: 'model' | 'product';
  veo_model?: 'veo-3.1-fast' | 'veo-3.1-quality';
  aspect_ratio?: 'landscape' | 'portrait';
  created_at: Date;
  updated_at: Date;
}

export type AssetStatus = 'pending' | 'queued' | 'generating' | 'done' | 'failed';

// Script Bank (Library)
export interface DBScriptLibrary {
  _id: string;               // ObjectId stringified at API boundary
  title: string;             // 1–200 char
  tags: string[];            // lowercase + dash, max 10, ≤50 char each
  content: string;           // 1–5000 char, full prompt text utuh
  source: 'manual' | 'upload';
  created_at: Date;
  updated_at: Date;
}

export type ScriptLibraryListItem = Omit<DBScriptLibrary, 'content'>;

// ============================================================
// V2 Studio Clean Flow types
// ============================================================

export interface Idea {
  title: string;       // 1-120 char
  content: string;     // 20-800 char, single paragraph naratif
}

export type ClipImageMode = 'inherit' | 'override' | 'ai-generate';

export interface Clip {
  index: number;                         // 0-5
  prompt: string;                        // 10-2000 char unified prompt
  imageMode: ClipImageMode;
  imageDataUrl?: string | null;          // wajib jika imageMode === 'override'
  generated_image_path?: string | null;
  generated_video_path?: string | null;
  image_status: AssetStatus;
  video_status: AssetStatus;
  image_error?: string | null;
  video_error?: string | null;
  media_generation_id?: string | null;
  video_job_id?: string | null;
  veo_prompt?: string | null;
  is_extended?: boolean;
  extended_from_index?: number | null;
  created_at: Date;
  updated_at?: Date;
}

export interface ConcatenatedVideo {
  id: string;
  clip_indices: number[];
  status: 'generating' | 'done' | 'failed';
  local_path?: string | null;
  error?: string | null;
  created_at: Date;
}

