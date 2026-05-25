-- Admin-configurable storage tiers
CREATE TABLE storage_tiers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  storage_gb   INT NOT NULL,
  price_monthly DECIMAL(10,2) DEFAULT 0,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Default tiers
INSERT INTO storage_tiers (name, storage_gb, price_monthly) VALUES
  ('Free',   2,   0.00),
  ('Pro',    50,  10.00),
  ('Studio', 200, 25.00);
