-- Migration: 106_escape_email_icon_row.sql
-- Security fix (Oct 25, 2026 audit), follow-up to 105.
--
-- build_email_icon_row puts the photographer's social/payment links into
-- the booking emails (105's functions call it). The link and its key went
-- in unescaped, and any URL scheme was accepted, so a link value could
-- break out of the href or be a javascript: link. Same rule as the Edge
-- Functions' safeUrl now: only http(s) links are shown, and both the link
-- and the key are escaped. Otherwise identical to the live definition.
--
-- ROLLBACK (the live definition before 106):
--   CREATE OR REPLACE FUNCTION public.build_email_icon_row(p_social_links jsonb, p_payment_links jsonb)
--    RETURNS text LANGUAGE plpgsql IMMUTABLE AS $function$
--   DECLARE v_row text := ''; v_key text; v_url text; v_combined jsonb;
--   BEGIN
--     v_combined := COALESCE(p_social_links, '{}'::jsonb) || COALESCE(p_payment_links, '{}'::jsonb);
--     FOR v_key, v_url IN SELECT key, value FROM jsonb_each_text(v_combined) LOOP
--       IF v_url IS NOT NULL AND trim(v_url) <> '' THEN
--         v_row := v_row || '<a href="' || v_url || '" style="display:inline-block;margin:0 5px;text-decoration:none;">' ||
--           '<img src="https://final-vault.app/brand-icons/' || v_key || '.png" alt="' || v_key || '" width="28" height="28" style="display:block;border:0;border-radius:7px;" />' || '</a>';
--       END IF;
--     END LOOP;
--     IF v_row = '' THEN RETURN ''; END IF;
--     RETURN '<table cellpadding="0" cellspacing="0" style="margin:18px auto 0;"><tr><td align="center">' || v_row || '</td></tr></table>';
--   END; $function$;

CREATE OR REPLACE FUNCTION public.build_email_icon_row(p_social_links jsonb, p_payment_links jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_row text := '';
  v_key text;
  v_url text;
  v_combined jsonb;
BEGIN
  v_combined := COALESCE(p_social_links, '{}'::jsonb) || COALESCE(p_payment_links, '{}'::jsonb);

  FOR v_key, v_url IN SELECT key, value FROM jsonb_each_text(v_combined) LOOP
    -- Only real web links; anything else (javascript:, data:, junk) is skipped.
    IF v_url IS NOT NULL AND trim(v_url) ~* '^https?://' THEN
      v_row := v_row ||
        '<a href="' || public.fv_escape_html(trim(v_url)) || '" style="display:inline-block;margin:0 5px;text-decoration:none;">' ||
        '<img src="https://final-vault.app/brand-icons/' || public.fv_escape_html(v_key) || '.png" alt="' || public.fv_escape_html(v_key) || '" width="28" height="28" style="display:block;border:0;border-radius:7px;" />' ||
        '</a>';
    END IF;
  END LOOP;

  IF v_row = '' THEN
    RETURN '';
  END IF;

  RETURN '<table cellpadding="0" cellspacing="0" style="margin:18px auto 0;"><tr><td align="center">' || v_row || '</td></tr></table>';
END;
$function$;
