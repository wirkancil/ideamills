/**
 * Fix Schema - Ensure all tables exist in public schema with correct names
 * Run this if you get "Could not find table in schema cache" errors
 */

-- Drop existing tables if they exist (backup data first if needed!)
DROP TABLE IF EXISTS public."Scenes" CASCADE;
DROP TABLE IF EXISTS public."Scripts" CASCADE;
DROP TABLE IF EXISTS public."Ideas" CASCADE;
DROP TABLE IF EXISTS public."Generations" CASCADE;
DROP TABLE IF EXISTS public."JobQueue" CASCADE;
DROP TABLE IF EXISTS public."Products" CASCADE;
DROP TABLE IF EXISTS public."Models" CASCADE;
DROP TABLE IF EXISTS public."Tenants" CASCADE;

-- Enable required extensions in public schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "vector" SCHEMA public;

-- Create Tenants table
CREATE TABLE public."Tenants" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Products table
CREATE TABLE public."Products" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public."Tenants"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Models table
CREATE TABLE public."Models" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public."Tenants"(id) ON DELETE CASCADE,
  name TEXT,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Generations table
CREATE TABLE public."Generations" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key TEXT UNIQUE NOT NULL,
  product_identifier TEXT NOT NULL,
  engine TEXT NOT NULL CHECK (engine IN ('gpt-4o', 'gemini-1.5-pro')),
  overrides TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on status for efficient querying
CREATE INDEX idx_generations_status ON public."Generations"(status);
CREATE INDEX idx_generations_created_at ON public."Generations"(created_at DESC);

-- Create Ideas table
CREATE TABLE public."Ideas" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID NOT NULL REFERENCES public."Generations"(id) ON DELETE CASCADE,
  idea_text TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX idx_ideas_embedding ON public."Ideas" USING ivfflat (embedding vector_cosine_ops);

-- Create Scripts table
CREATE TABLE public."Scripts" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID NOT NULL REFERENCES public."Generations"(id) ON DELETE CASCADE,
  idea_id UUID NOT NULL REFERENCES public."Ideas"(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  idx INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(generation_id, idx)
);

-- Create index for Scripts
CREATE INDEX idx_scripts_generation_id ON public."Scripts"(generation_id);
CREATE INDEX idx_scripts_idx ON public."Scripts"(idx);

-- Create Scenes table
CREATE TABLE public."Scenes" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  script_id UUID NOT NULL REFERENCES public."Scripts"(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL,
  struktur TEXT NOT NULL,
  naskah_vo TEXT NOT NULL,
  visual_idea TEXT NOT NULL,
  text_to_image TEXT,
  image_to_video TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(script_id, "order")
);

-- Create index for Scenes
CREATE INDEX idx_scenes_script_id ON public."Scenes"(script_id);
CREATE INDEX idx_scenes_order ON public."Scenes"("order");

-- Create JobQueue table
CREATE TABLE public."JobQueue" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID NOT NULL REFERENCES public."Generations"(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for JobQueue
CREATE INDEX idx_jobqueue_status ON public."JobQueue"(status);
CREATE INDEX idx_jobqueue_created_at ON public."JobQueue"(created_at);

-- Grant permissions to authenticated users
GRANT ALL ON public."Tenants" TO authenticated;
GRANT ALL ON public."Products" TO authenticated;
GRANT ALL ON public."Models" TO authenticated;
GRANT ALL ON public."Generations" TO authenticated;
GRANT ALL ON public."Ideas" TO authenticated;
GRANT ALL ON public."Scripts" TO authenticated;
GRANT ALL ON public."Scenes" TO authenticated;
GRANT ALL ON public."JobQueue" TO authenticated;

GRANT ALL ON public."Tenants" TO anon;
GRANT ALL ON public."Products" TO anon;
GRANT ALL ON public."Models" TO anon;
GRANT ALL ON public."Generations" TO anon;
GRANT ALL ON public."Ideas" TO anon;
GRANT ALL ON public."Scripts" TO anon;
GRANT ALL ON public."Scenes" TO anon;
GRANT ALL ON public."JobQueue" TO anon;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Verify tables exist
SELECT 
  schemaname,
  tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('Generations', 'Ideas', 'Scripts', 'Scenes', 'Products', 'Models', 'Tenants', 'JobQueue')
ORDER BY tablename;

