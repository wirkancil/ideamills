-- IdeaMill Database Schema
-- Idempotent DDL - safe to re-run

-- Enable required extensions
create extension if not exists vector;
create extension if not exists pgcrypto;

-- Tenancy (optional for multi-tenant deployments)
create table if not exists Tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Product & Model snapshots (from L0 Vision)
create table if not exists Products (
  id uuid primary key default gen_random_uuid(),
  product_identifier text not null unique,
  description jsonb not null,      -- normalized vision output
  created_at timestamptz default now()
);

create table if not exists Models (
  id uuid primary key default gen_random_uuid(),
  model_identifier text not null unique,
  description jsonb not null,      -- normalized vision or generic text
  source text not null,            -- 'vision' | 'generic'
  created_at timestamptz default now()
);

-- Memory: semantic ideas with vector embeddings
create table if not exists Ideas (
  id uuid primary key default gen_random_uuid(),
  product_identifier text not null,
  category_tag text,
  idea_theme text not null,
  idea_vector vector(1536) not null,
  created_at timestamptz default now()
);

-- Vector similarity index (IVFFLAT for cosine similarity)
create index if not exists ideas_vec_idx
  on Ideas using ivfflat (idea_vector vector_cosine_ops) with (lists = 100);
create index if not exists ideas_prod_idx on Ideas(product_identifier);
create index if not exists ideas_cat_idx on Ideas(category_tag);

-- Generation jobs
create table if not exists Generations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text unique not null,
  tenant_id uuid,
  product_identifier text not null,
  model_identifier text,
  engine text not null check (engine in ('gpt-4o','gemini-1.5-pro')),
  overrides text,
  status text not null default 'queued', -- queued|running|partial|succeeded|failed|canceled
  progress int not null default 0,
  error text,
  created_at timestamptz default now()
);

create index if not exists gens_tenant_idx on Generations(tenant_id);
create index if not exists gens_status_idx on Generations(status);
create index if not exists gens_created_idx on Generations(created_at desc);

-- Scripts (100 variations)
create table if not exists Scripts (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references Generations(id) on delete cascade,
  theme text not null,
  idx int not null,      -- 1..100
  structure jsonb not null,
  model_used text not null,
  token_in int default 0,
  token_out int default 0,
  latency_ms int default 0,
  created_at timestamptz default now(),
  unique(generation_id, idx)
);

create index if not exists scripts_gen_idx on Scripts(generation_id);

-- Scenes per script (3-4 scenes each)
create table if not exists Scenes (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references Scripts(id) on delete cascade,
  "order" int not null,
  struktur text not null check (struktur in ('Hook','Problem','Solution','CTA')),
  naskah_vo text not null,
  visual_idea text not null,
  text_to_image text,
  image_to_video text,
  created_at timestamptz default now(),
  unique(script_id, "order")
);

create index if not exists scenes_script_idx on Scenes(script_id);

-- Optional: Seed data for development
-- insert into Ideas(product_identifier, category_tag, idea_theme, idea_vector)
-- values (
--   'seed-product', 'haircare', 'Morning Rush Refresh',
--   array_fill(0.0::float, array[1536])
-- ) on conflict do nothing;

