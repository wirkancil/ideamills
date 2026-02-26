-- PostgreSQL-based Queue System
-- Alternative to Redis/BullMQ for Supabase

-- Create job queue table
create table if not exists JobQueue (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references Generations(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending', -- pending|processing|completed|failed
  attempts int not null default 0,
  max_attempts int not null default 3,
  error text,
  scheduled_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- Indexes for efficient queue processing
create index if not exists job_queue_status_idx on JobQueue(status, scheduled_at);
create index if not exists job_queue_gen_idx on JobQueue(generation_id);

-- Function to dequeue next job (atomic)
create or replace function dequeue_job()
returns table (
  id uuid,
  generation_id uuid,
  payload jsonb
) language plpgsql as $$
declare
  job_id uuid;
begin
  -- Lock and get next pending job
  select jq.id into job_id
  from JobQueue jq
  where jq.status = 'pending'
    and jq.scheduled_at <= now()
    and jq.attempts < jq.max_attempts
  order by jq.scheduled_at asc
  limit 1
  for update skip locked;

  -- Update status to processing
  if job_id is not null then
    update JobQueue
    set status = 'processing',
        started_at = now(),
        attempts = attempts + 1
    where JobQueue.id = job_id;

    -- Return the job
    return query
    select jq.id, jq.generation_id, jq.payload
    from JobQueue jq
    where jq.id = job_id;
  end if;
end;
$$;

-- Function to mark job as completed
create or replace function complete_job(job_id uuid)
returns void language sql as $$
  update JobQueue
  set status = 'completed',
      completed_at = now()
  where id = job_id;
$$;

-- Function to mark job as failed
create or replace function fail_job(job_id uuid, error_message text)
returns void language sql as $$
  update JobQueue
  set status = case 
    when attempts >= max_attempts then 'failed'
    else 'pending'
  end,
  error = error_message,
  scheduled_at = case
    when attempts < max_attempts then now() + interval '1 minute' * power(2, attempts)
    else scheduled_at
  end
  where id = job_id;
$$;

-- Cleanup old completed jobs (run via cron or manually)
create or replace function cleanup_old_jobs()
returns void language sql as $$
  delete from JobQueue
  where status = 'completed'
    and completed_at < now() - interval '7 days';
$$;

