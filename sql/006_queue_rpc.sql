/**
 * Queue RPC Functions
 * Required for worker to interact with JobQueue
 */

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS dequeue_job();
DROP FUNCTION IF EXISTS complete_job(UUID);
DROP FUNCTION IF EXISTS fail_job(UUID, TEXT);
DROP FUNCTION IF EXISTS cleanup_old_jobs();

-- Function: Dequeue next available job (atomic)
CREATE OR REPLACE FUNCTION dequeue_job()
RETURNS SETOF "JobQueue"
LANGUAGE plpgsql
AS $$
DECLARE
  job_record "JobQueue";
BEGIN
  -- Lock and get next pending job (FIFO)
  SELECT * INTO job_record
  FROM "JobQueue"
  WHERE status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If no job found, return empty
  IF job_record IS NULL THEN
    RETURN;
  END IF;

  -- Mark as processing
  UPDATE "JobQueue"
  SET 
    status = 'processing',
    started_at = NOW()
  WHERE id = job_record.id;

  -- Return the job
  RETURN NEXT job_record;
END;
$$;

-- Function: Mark job as completed
CREATE OR REPLACE FUNCTION complete_job(job_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "JobQueue"
  SET 
    status = 'completed',
    completed_at = NOW()
  WHERE id = job_id;
END;
$$;

-- Function: Mark job as failed
CREATE OR REPLACE FUNCTION fail_job(job_id UUID, error_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "JobQueue"
  SET 
    status = 'failed',
    error = error_message,
    completed_at = NOW()
  WHERE id = job_id;
END;
$$;

-- Function: Cleanup old completed/failed jobs (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM "JobQueue"
  WHERE status IN ('completed', 'failed')
  AND completed_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION dequeue_job() TO authenticated;
GRANT EXECUTE ON FUNCTION complete_job(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fail_job(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_jobs() TO authenticated;

GRANT EXECUTE ON FUNCTION dequeue_job() TO anon;
GRANT EXECUTE ON FUNCTION complete_job(UUID) TO anon;
GRANT EXECUTE ON FUNCTION fail_job(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION cleanup_old_jobs() TO anon;

-- Test the functions
SELECT 'Queue RPC functions created successfully!' as message;

