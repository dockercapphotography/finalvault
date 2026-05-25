-- Run this if you already ran the test schema setup and got a base64url error
-- Fixes the share_token default in the test schema

ALTER TABLE test.galleries 
  ALTER COLUMN share_token SET DEFAULT gen_random_uuid()::text;
