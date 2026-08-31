-- Migration 054: microsite favicon
--
-- Adds favicon_r2_key to `microsites`, editable from Website > Content >
-- Branding alongside the existing logo / dark logo overrides (see
-- sql/036_microsite_logo_override.sql, sql/047_microsite_dark_logo.sql).
--
-- Scoped to the microsite (not the photographer account, unlike
-- logo_r2_key) since that's exactly where this lives in the UI. And
-- deliberately no fallback to the studio logo the way logo_r2_key falls
-- back to the account logo: a photographer's regular logo is often not
-- square/simple enough to read as a tiny browser-tab icon, so "no
-- favicon uploaded" falls all the way back to FinalVault's own default
-- rather than silently reusing the logo.
--
-- No RPC changes needed: get_site_by_hostname()'s 'microsite' branch
-- (sql/053_fix_get_site_by_hostname_arg_limit.sql) builds its return
-- value from to_jsonb(v_microsite), which picks up any microsites
-- column automatically -- this one included. The 'placeholder' branch
-- is untouched: a favicon before a microsite exists is out of scope,
-- and CustomDomainRoot.jsx's favicon swap already no-ops when
-- favicon_r2_key is absent, so that falls back correctly on its own.
--
-- No worker changes needed either: favicons upload under the same
-- photographers/{id}/logos/ prefix as the logo/dark logo overrides, so
-- they're served by the existing public /logo/:key route as-is.
--
-- Run after: 053_fix_get_site_by_hostname_arg_limit.sql

ALTER TABLE microsites
  ADD COLUMN IF NOT EXISTS favicon_r2_key text;
