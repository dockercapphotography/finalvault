-- Migration 024: photographer_domains table for the custom-domains feature
--
-- One domain per photographer (v1 scope, per docs/custom-domains-spec.md
-- section 3.2 and non-goals section 4). Mutations happen through the
-- manage-custom-domain Edge Function using a service-role client, so
-- photographers only get read access to their own row here — same pattern
-- as photographer_storage (own uuid PK, photographer_id UNIQUE, no direct
-- owner-level write grants).

CREATE TABLE public.photographer_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL UNIQUE REFERENCES public.photographers(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  cloudflare_hostname_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'error')),
  ssl_status text,
  verification_errors jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.photographer_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photographers can read own domain"
  ON public.photographer_domains
  FOR SELECT
  USING (auth.uid() = photographer_id);

CREATE POLICY "Admins can manage all domains"
  ON public.photographer_domains
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT ON public.photographer_domains TO authenticated;
