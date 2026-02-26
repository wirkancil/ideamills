-- Enable Required Extensions First
-- Run this BEFORE 001_init.sql if you get "extension vector does not exist" error

-- Enable pgvector extension for semantic search
create extension if not exists vector;

-- Enable pgcrypto for UUID generation
create extension if not exists pgcrypto;

-- Verify extensions are enabled
SELECT extname, extversion 
FROM pg_extension 
WHERE extname IN ('vector', 'pgcrypto');

