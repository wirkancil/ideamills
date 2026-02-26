-- Row Level Security Policies
-- Optional for multi-tenant deployments
-- Safe to re-run (drops existing policies first)

-- Enable RLS on Generations
alter table Generations enable row level security;

-- Drop existing policies if they exist
drop policy if exists gen_tenant_isolation on Generations;

-- Policy: Users can only see their own generations
create policy gen_tenant_isolation on Generations 
  for select 
  using (
    tenant_id = auth.uid() or tenant_id is null
  );

-- Enable RLS on Scripts (inherits from Generations)
alter table Scripts enable row level security;

drop policy if exists scripts_tenant_isolation on Scripts;

create policy scripts_tenant_isolation on Scripts
  for select
  using (
    exists (
      select 1 from Generations g 
      where g.id = Scripts.generation_id 
      and (g.tenant_id = auth.uid() or g.tenant_id is null)
    )
  );

-- Enable RLS on Scenes (inherits from Scripts -> Generations)
alter table Scenes enable row level security;

drop policy if exists scenes_tenant_isolation on Scenes;

create policy scenes_tenant_isolation on Scenes
  for select
  using (
    exists (
      select 1 from Scripts s
      join Generations g on g.id = s.generation_id
      where s.id = Scenes.script_id
      and (g.tenant_id = auth.uid() or g.tenant_id is null)
    )
  );

-- Enable RLS on Ideas (optional - if exposing to users)
alter table Ideas enable row level security;

drop policy if exists ideas_read_all on Ideas;

create policy ideas_read_all on Ideas
  for select
  using (true); -- Allow read for all (memory is shared)

