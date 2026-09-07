-- Migration: 080_premium_feature_tier_gating.sql
-- Gates Custom Domain + Microsite (treated as one combined premium
-- feature, per Nick's call -- a microsite can't be publicly viewed
-- without a custom domain anyway) behind a new per-tier flag.
--
-- Losing access does NOT delete or corrupt anything -- a photographer's
-- photographer_domains row and their microsite content both stay
-- exactly as they were. The actual "disable" happens at read/redirect
-- time (the frontend gate hook, plus get_site_by_hostname below), so
-- restoring access later just works immediately with no reconfiguration.
--
-- Safety backfill: any tier currently in use by a photographer with an
-- active domain or a live (enabled) microsite gets allow_premium_features
-- set to true automatically -- this migration should never silently
-- lock out something already in active use the moment it ships.
--
-- Run after: 079_bell_pref_visibility_cutoff.sql

ALTER TABLE storage_tiers ADD COLUMN IF NOT EXISTS allow_premium_features boolean NOT NULL DEFAULT false;

UPDATE storage_tiers st
SET allow_premium_features = true
WHERE id IN (
  SELECT DISTINCT ps.tier_id
  FROM photographer_storage ps
  WHERE ps.tier_id IS NOT NULL
    AND (
      ps.photographer_id IN (SELECT photographer_id FROM photographer_domains)
      OR ps.photographer_id IN (SELECT photographer_id FROM microsites WHERE enabled = true)
    )
);

-- ── Shared entitlement check ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.photographer_has_premium_access(p_photographer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT st.allow_premium_features
     FROM photographer_storage ps
     JOIN storage_tiers st ON st.id = ps.tier_id
     WHERE ps.photographer_id = p_photographer_id),
    false
  );
$function$;

GRANT EXECUTE ON FUNCTION photographer_has_premium_access(uuid) TO authenticated, anon;

-- ── Self-check for the logged-in photographer (Account/MicrositeEditor) ──

CREATE OR REPLACE FUNCTION public.get_my_premium_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT photographer_has_premium_access(auth.uid());
$function$;

GRANT EXECUTE ON FUNCTION get_my_premium_access() TO authenticated;

-- ── Hostname-based check for the public redirect gate ─────────────────
-- Returns true (meaning "nothing to gate, don't redirect") both when
-- the hostname isn't a recognized custom domain at all, and when it is
-- and has access. Only false when it's a real, configured custom
-- domain that has lost entitlement.

CREATE OR REPLACE FUNCTION public.get_domain_premium_access(p_hostname text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_photographer_id uuid;
BEGIN
  SELECT photographer_id INTO v_photographer_id
  FROM photographer_domains
  WHERE domain = p_hostname;

  IF v_photographer_id IS NULL THEN
    RETURN true;
  END IF;

  RETURN photographer_has_premium_access(v_photographer_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION get_domain_premium_access(text) TO anon;

-- ── Backend enforcement: block enabling a microsite without access ────
-- Defense against the editor UI being bypassed entirely (a direct API
-- call replaying what the editor's own save request looks like) -- not
-- just a hidden button.

CREATE OR REPLACE FUNCTION public.enforce_microsite_premium_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.enabled = true AND (TG_OP = 'INSERT' OR OLD.enabled IS DISTINCT FROM true) THEN
    IF NOT photographer_has_premium_access(NEW.photographer_id) THEN
      RAISE EXCEPTION 'Your current plan does not include the Microsite feature.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_microsite_premium_access ON microsites;
CREATE TRIGGER trg_enforce_microsite_premium_access
  BEFORE INSERT OR UPDATE ON microsites
  FOR EACH ROW
  EXECUTE FUNCTION enforce_microsite_premium_access();
