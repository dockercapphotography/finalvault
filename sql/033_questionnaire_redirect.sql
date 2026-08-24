-- Migration: 033_questionnaire_redirect.sql
-- Feature: v1.5.8 -- post-submission redirect (e.g. "follow us on
-- Instagram" after a hall-shots questionnaire is submitted)
--
-- questionnaire_templates itself isn't tracked in any migration in this
-- repo (live-schema pattern, same as several other tables in this
-- project) -- this ALTER is safe regardless, it just adds columns to
-- whatever the live table currently looks like.
--
-- redirect_url/redirect_label store the RESOLVED destination -- not
-- which social platform was picked in the UI. The editor lets the
-- photographer choose from their already-configured Account > Social
-- Links (Instagram, Facebook, etc.) or type a custom URL (a Google
-- Reviews link, a specific post, their website -- not restricted to
-- social platforms), but by the time it's saved here it's just a plain
-- URL + button label. No need to also track "which platform" separately
-- since the editor always re-derives its dropdown selection from
-- whether the saved URL matches one of the photographer's current
-- social links, and falls back to "Custom" display if it doesn't.
--
-- redirect_auto/redirect_delay_seconds are independent of whether a
-- redirect is configured at all (redirect_url null = feature off
-- entirely) -- auto is an enhancement on top of the always-shown button,
-- not a replacement for it (see the button+optional-auto-redirect
-- decision, Aug 2026).

ALTER TABLE questionnaire_templates
  ADD COLUMN redirect_url TEXT,
  ADD COLUMN redirect_label TEXT,
  ADD COLUMN redirect_auto BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN redirect_delay_seconds INTEGER NOT NULL DEFAULT 5
    CHECK (redirect_delay_seconds BETWEEN 1 AND 30);
