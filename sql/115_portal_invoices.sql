-- 115_portal_invoices.sql
-- v1.6.0 step 7: invoices in the Client Portal.
--
-- get_client_portal_data gains an "invoices" key: the client's sent
-- invoices (drafts and voids are never shown) with totals, line items,
-- schedule, payments (no notes) and the payment link to show. The rest of
-- the function -- token lookup, password gate and lockout, galleries,
-- contracts, questionnaires -- is the live definition copied unchanged
-- (taken from pg_get_functiondef on Oct 31, 2026).
--
-- CREATE OR REPLACE keeps the existing grants and owner.
--
-- Run after: 114_migrate_session_money.sql

CREATE OR REPLACE FUNCTION public.get_client_portal_data(p_token text, p_password text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_client clients;
  v_result JSON;
  v_now timestamptz := now();
  v_attempts integer;
  v_delay_seconds numeric;
BEGIN
  SELECT * INTO v_client FROM clients WHERE portal_token = p_token;
  IF v_client IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_client.portal_password_hash IS NOT NULL THEN

    IF v_client.portal_password_locked_until IS NOT NULL AND v_client.portal_password_locked_until > v_now THEN
      RETURN json_build_object(
        'password_required', true,
        'locked', true,
        'retry_after_seconds', EXTRACT(EPOCH FROM (v_client.portal_password_locked_until - v_now))
      );
    END IF;

    IF p_password IS NULL THEN
      RETURN json_build_object('password_required', true, 'locked', false);
    END IF;

    IF crypt(p_password, v_client.portal_password_hash) = v_client.portal_password_hash THEN
      UPDATE clients
      SET portal_password_attempts = 0,
          portal_password_locked_until = NULL,
          portal_password_last_attempt_at = NULL
      WHERE id = v_client.id;
    ELSE
      IF v_client.portal_password_last_attempt_at IS NOT NULL
         AND v_now - v_client.portal_password_last_attempt_at > interval '1 hour' THEN
        v_attempts := 1;
      ELSE
        v_attempts := v_client.portal_password_attempts + 1;
      END IF;

      IF v_attempts > 5 THEN
        v_delay_seconds := LEAST(15 * POWER(2, v_attempts - 6), 86400);
        UPDATE clients
        SET portal_password_attempts = v_attempts,
            portal_password_locked_until = v_now + (v_delay_seconds || ' seconds')::interval,
            portal_password_last_attempt_at = v_now
        WHERE id = v_client.id;

        RETURN json_build_object(
          'password_required', true,
          'locked', true,
          'retry_after_seconds', v_delay_seconds,
          'error', 'invalid_password'
        );
      ELSE
        UPDATE clients
        SET portal_password_attempts = v_attempts,
            portal_password_last_attempt_at = v_now
        WHERE id = v_client.id;

        RETURN json_build_object('password_required', true, 'locked', false, 'error', 'invalid_password');
      END IF;
    END IF;

  END IF;

  SELECT json_build_object(
    'password_required', false,
    'client', json_build_object(
      'id', v_client.id,
      'first_name', v_client.first_name,
      'last_name', v_client.last_name,
      'email', v_client.email,
      'photographer_id', v_client.photographer_id
    ),
    'galleries', (
      SELECT COALESCE(json_agg(deduped.* ORDER BY deduped.event_date DESC NULLS LAST), '[]'::json)
      FROM (
        SELECT DISTINCT ON (g.id)
          g.id, g.title, g.event_name, g.event_date, g.share_token,
          g.cover_r2_key, g.cover_focus_x, g.cover_focus_y,
          g.is_active, g.expires_at, g.session_id, g.session_name,
          g.require_password, g.plain_password,
          g.require_download_pin, g.plain_download_pin,
          EXISTS (
            SELECT 1 FROM gallery_viewers gv
            WHERE gv.gallery_id = g.id
              AND v_client.email IS NOT NULL
              AND lower(trim(gv.email)) = lower(trim(v_client.email))
          ) AS viewed
        FROM (
          SELECT g.id, g.title, g.event_name, g.event_date, g.share_token,
                 g.cover_r2_key, g.cover_focus_x, g.cover_focus_y,
                 g.is_active, g.expires_at,
                 NULL::UUID AS session_id, NULL::TEXT AS session_name,
                 g.require_password, g.plain_password,
                 g.require_download_pin, g.plain_download_pin
          FROM galleries g
          JOIN gallery_clients gc ON gc.gallery_id = g.id
          WHERE gc.client_id = v_client.id
          UNION ALL
          SELECT g.id, g.title, g.event_name, g.event_date, g.share_token,
                 g.cover_r2_key, g.cover_focus_x, g.cover_focus_y,
                 g.is_active, g.expires_at,
                 s.id AS session_id, s.name AS session_name,
                 g.require_password, g.plain_password,
                 g.require_download_pin, g.plain_download_pin
          FROM galleries g
          JOIN session_galleries sg ON sg.gallery_id = g.id
          JOIN sessions s ON s.id = sg.session_id
          WHERE s.client_id = v_client.id
        ) g
        ORDER BY g.id, g.session_id NULLS LAST
      ) deduped
    ),
    'contracts', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', c.id, 'title', c.title, 'status', c.status,
        'sign_token', c.sign_token, 'sent_at', c.sent_at,
        'signed_at', c.signed_at, 'signed_name', c.signed_name,
        'photographer_signed_at', c.photographer_signed_at,
        'photographer_signed_name', c.photographer_signed_name,
        'body_hash', c.body_hash, 'pdf_r2_key', c.pdf_r2_key
      ) ORDER BY COALESCE(c.signed_at, c.sent_at) DESC), '[]'::json)
      FROM contracts c
      WHERE c.client_id = v_client.id AND c.status IN ('sent', 'pending_photographer', 'signed')
    ),
    'pending_questionnaires', (
      SELECT COALESCE(json_agg(json_build_object(
        'session_id', s.id,
        'session_name', s.name,
        'submit_token', s.submit_token,
        'questionnaire_id', sq.questionnaire_id,
        'questionnaire_name', qt.name
      )), '[]'::json)
      FROM sessions s
      JOIN session_questionnaires sq ON sq.session_id = s.id
      JOIN questionnaire_templates qt ON qt.id = sq.questionnaire_id
      WHERE s.client_id = v_client.id
        AND s.submit_token IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM session_submissions ss
          WHERE ss.session_id = s.id
            AND ss.questionnaire_id = sq.questionnaire_id
            AND v_client.email IS NOT NULL
            AND lower(trim(ss.email)) = lower(trim(v_client.email))
        )
    ),
    -- v1.6.0 (115): sent invoices only; drafts and voids stay private.
    -- Everything the portal list and detail pages need, so the detail page
    -- reads the same cached payload. Payment notes are photographer-only
    -- and are not included.
    'invoices', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', i.id,
        'invoice_number', i.invoice_number,
        'session_name', s.name,
        'session_date', s.session_date,
        'notes', i.notes,
        'due_date', i.due_date,
        'sent_at', i.sent_at,
        'created_at', i.created_at,
        'tax_rate', i.tax_rate,
        'discount_rate', i.discount_rate,
        'subtotal', t.subtotal,
        'discount_amount', t.discount_amount,
        'tax_amount', t.tax_amount,
        'total', t.total,
        'amount_paid', t.amount_paid,
        'balance_due', t.balance_due,
        'payment_status', t.payment_status,
        'next_due_date', t.next_due_date,
        'is_overdue', t.is_overdue,
        -- What the Pay button asks for: the rest of the next unpaid
        -- installment, or the whole balance when there's no schedule.
        'next_amount', COALESCE((
          SELECT ss.amount - ss.allocated
          FROM invoice_schedule_status ss
          WHERE ss.invoice_id = i.id AND ss.row_status <> 'paid'
          ORDER BY ss.sequence LIMIT 1
        ), t.balance_due),
        'pay_platform', pay.platform,
        'pay_value', pay.value,
        'line_items', (
          SELECT COALESCE(json_agg(json_build_object(
            'title', li.title, 'description', li.description,
            'quantity', li.quantity, 'unit_price', li.unit_price, 'unit_label', li.unit_label,
            'taxable', li.taxable, 'line_total', round(li.quantity * li.unit_price, 2)
          ) ORDER BY li.sort_order, li.created_at), '[]'::json)
          FROM invoice_line_items li WHERE li.invoice_id = i.id
        ),
        'schedule', (
          SELECT COALESCE(json_agg(json_build_object(
            'sequence', ss.sequence, 'amount', ss.amount, 'due_date', ss.due_date,
            'allocated', ss.allocated, 'row_status', ss.row_status
          ) ORDER BY ss.sequence), '[]'::json)
          FROM invoice_schedule_status ss WHERE ss.invoice_id = i.id
        ),
        'payments', (
          SELECT COALESCE(json_agg(json_build_object(
            'amount', p.amount, 'paid_date', p.paid_date, 'method', p.method
          ) ORDER BY p.paid_date, p.created_at), '[]'::json)
          FROM invoice_payments p WHERE p.invoice_id = i.id
        )
      ) ORDER BY i.sent_at DESC NULLS LAST, i.invoice_number DESC), '[]'::json)
      FROM invoices i
      JOIN invoice_totals t ON t.invoice_id = i.id
      LEFT JOIN sessions s ON s.id = i.session_id
      LEFT JOIN photographers ph ON ph.id = i.photographer_id
      LEFT JOIN LATERAL (
        SELECT x.platform, NULLIF(btrim(ph.payment_links ->> x.platform), '') AS value
        FROM (SELECT COALESCE(i.payment_platform, ph.default_invoice_platform) AS platform) x
      ) pay ON true
      WHERE i.client_id = v_client.id
        AND i.photographer_id = v_client.photographer_id
        AND i.status = 'sent'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- Verify (expect true):
-- select pg_get_functiondef('public.get_client_portal_data(text, text)'::regprocedure) ilike '%''invoices''%';

-- Rollback: re-run the definition from before this migration (the same
-- function without the 'invoices' block).
