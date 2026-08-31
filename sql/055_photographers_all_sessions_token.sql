-- Migration 055: all-sessions aggregate link, part 1 — the token
--
-- Adds all_sessions_token to `photographers`: a stable, opaque per-
-- photographer token backing a NEW standalone public link,
-- /book/all/:token, that lists every active signup page for that
-- photographer.
--
-- Deliberately modeled on signup_pages.token (opaque, unguessable,
-- never a slug) rather than a hostname-based route -- consistent with
-- every other public link in the app (galleries, client portal,
-- questionnaires, individual signup pages), and works whether or not
-- the photographer has a custom domain, since it's meant to be usable
-- anywhere (a bio link, an email signature, a QR code), not just from
-- the microsite.
--
-- DEFAULT backfills every existing photographer row with a real token
-- (not null), and covers new rows going forward -- no application code
-- needs to generate or set this itself, the same way gen_random_uuid()
-- already backfills primary keys.
--
-- Run after: 054_microsite_favicon.sql

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS all_sessions_token text UNIQUE
    DEFAULT replace(gen_random_uuid()::text, '-', '');
