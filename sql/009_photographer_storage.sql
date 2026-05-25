-- Storage usage per photographer
CREATE TABLE photographer_storage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id         UUID REFERENCES storage_tiers(id),
  bytes_used      BIGINT DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT now()
);
