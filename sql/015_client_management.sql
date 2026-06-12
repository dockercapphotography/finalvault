-- Migration: 015_client_management.sql
-- Feature: Client Management & Contracts — v1.2.0
-- Run after: 014_client_access_rpcs.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add business_name to photographers (may already exist on live DB)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS business_name TEXT;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. clients table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  notes           TEXT,
  tags            TEXT[],
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clients_photographer ON clients (photographer_id);
CREATE INDEX idx_clients_email        ON clients (photographer_id, email);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photographers manage own clients"
  ON clients FOR ALL
  USING (photographer_id = auth.uid())
  WITH CHECK (photographer_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. contract_templates table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE contract_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contract_templates_photographer ON contract_templates (photographer_id);

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photographers manage own contract templates"
  ON contract_templates FOR ALL
  USING (photographer_id = auth.uid())
  WITH CHECK (photographer_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. contracts table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE contracts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id          UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  client_id                UUID REFERENCES clients(id) ON DELETE SET NULL,
  template_id              UUID REFERENCES contract_templates(id) ON DELETE SET NULL,
  gallery_id               UUID REFERENCES galleries(id) ON DELETE SET NULL,
  title                    TEXT NOT NULL,
  body                     TEXT NOT NULL,
  body_hash                TEXT NOT NULL,
  status                   TEXT DEFAULT 'draft'
                             CHECK (status IN ('draft','sent','pending_photographer','signed','void')),
  sign_token               TEXT UNIQUE,
  signed_at                TIMESTAMPTZ,
  signed_name              TEXT,
  signed_ip                TEXT,
  signed_user_agent        TEXT,
  photographer_signed_at   TIMESTAMPTZ,
  photographer_signed_name TEXT,
  pdf_r2_key               TEXT,
  sent_at                  TIMESTAMPTZ,
  void_at                  TIMESTAMPTZ,
  void_reason              TEXT,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contracts_photographer ON contracts (photographer_id);
CREATE INDEX idx_contracts_client       ON contracts (client_id);
CREATE INDEX idx_contracts_gallery      ON contracts (gallery_id);
CREATE INDEX idx_contracts_sign_token   ON contracts (sign_token);
CREATE INDEX idx_contracts_status       ON contracts (photographer_id, status);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Photographer can manage their own contracts
CREATE POLICY "Photographers manage own contracts"
  ON contracts FOR ALL
  USING (photographer_id = auth.uid())
  WITH CHECK (photographer_id = auth.uid());

-- Public (anon) can read a contract by sign_token — needed for the signing page
CREATE POLICY "Public can view contract by sign token"
  ON contracts FOR SELECT
  TO anon
  USING (sign_token IS NOT NULL AND status IN ('sent', 'pending_photographer'));

-- Grant anon read access for signing page
GRANT SELECT ON contracts TO anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Add client_id to galleries
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX idx_galleries_client ON galleries (client_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Update gallery_activity_log action check constraint
--    Add 'contract_signed' alongside existing actions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE gallery_activity_log
  DROP CONSTRAINT gallery_activity_log_action_check;

ALTER TABLE gallery_activity_log
  ADD CONSTRAINT gallery_activity_log_action_check
  CHECK (action IN (
    'view', 'favorite', 'unfavorite', 'comment',
    'download_single', 'download_all',
    'selection_submitted',
    'contract_signed'
  ));


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Seed default contract templates for new photographers
--    Extends the existing seed_default_gallery_templates trigger function
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_default_contract_templates()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO contract_templates (photographer_id, name, body)
  VALUES
    (
      NEW.id,
      'Portrait Session Agreement',
      'PORTRAIT SESSION AGREEMENT

This agreement is entered into between {{photographer_name}} / {{studio_name}} ("Photographer") and {{client_name}} ("Client") on {{today_date}}.

SESSION DETAILS
Gallery: {{gallery_title}}
Event Date: {{event_date}}

SERVICES
Photographer agrees to provide portrait photography services for the session described above. Photographer will deliver edited digital images via an online gallery within the agreed-upon timeframe.

PAYMENT
Client agrees to pay the session fee as previously discussed. Payment is due prior to or at the time of the session.

IMAGE DELIVERY
Final images will be delivered via a private online gallery. Client will receive instructions for downloading images. Images are retained for 90 days after delivery.

COPYRIGHT & USAGE
Photographer retains full copyright to all images produced during this session. Client receives a personal-use license for the delivered images, including printing and sharing on personal social media with photographer credit. Commercial use requires a separate written agreement.

MODEL RELEASE
Client grants Photographer permission to use session images for portfolio, website, and promotional purposes. If Client does not consent to this use, Client must notify Photographer in writing prior to the session.

CANCELLATION
Cancellations made less than 48 hours before the session may forfeit the session fee. Photographer will make reasonable efforts to reschedule.

LIMITATION OF LIABILITY
Photographer''s liability is limited to the session fee paid. Photographer is not liable for equipment failure, illness, or acts of nature that prevent completion of services.

By signing below, Client confirms they have read and agree to these terms.

___

Client Signature: {{client_name}}
Date: {{sign_date}}'
    ),
    (
      NEW.id,
      'Event Photography Agreement',
      'EVENT PHOTOGRAPHY AGREEMENT

This agreement is entered into between {{photographer_name}} / {{studio_name}} ("Photographer") and {{client_name}} ("Client") on {{today_date}}.

EVENT DETAILS
Event: {{gallery_title}}
Event Date: {{event_date}}
Client Email: {{client_email}}

SERVICES
Photographer agrees to provide event photography coverage as discussed. Coverage includes candid and posed photographs of the event as opportunities arise.

PAYMENT
Client agrees to pay the agreed fee. A non-refundable retainer is due upon signing, with the balance due prior to the event date.

IMAGE DELIVERY
Edited images will be delivered within the agreed-upon timeframe following the event via a private online gallery.

COPYRIGHT & USAGE
Photographer retains copyright to all images. Client receives a personal-use license for delivered images. Commercial licensing available separately.

CANCELLATION & RESCHEDULING
If Client cancels or reschedules less than 7 days before the event, the retainer is forfeited. Photographer will make reasonable efforts to accommodate rescheduling.

FORCE MAJEURE
Neither party is liable for failure to perform due to circumstances beyond their reasonable control.

By signing below, Client confirms they have read and agree to these terms.

___

Client Signature: {{client_name}}
Date: {{sign_date}}'
    ),
    (
      NEW.id,
      'Commercial Usage License',
      'COMMERCIAL PHOTOGRAPHY LICENSE AGREEMENT

This agreement is entered into between {{photographer_name}} / {{studio_name}} ("Photographer/Licensor") and {{client_name}} ("Client/Licensee") on {{today_date}}.

IMAGES LICENSED
Gallery: {{gallery_title}}
This license covers the images delivered as part of the above-referenced gallery or session.

GRANT OF LICENSE
Photographer grants Client a non-exclusive, non-transferable commercial license to use the licensed images for the following purposes:
- Advertising and marketing materials
- Website and digital use
- Print materials including brochures, banners, and signage
- Social media (commercial accounts)

RESTRICTIONS
Client may not sublicense, resell, or transfer these images to third parties. Client may not claim copyright over the images. Modification of images must be approved in writing.

DURATION
This license is perpetual unless otherwise specified in writing.

CREDIT
Where practical, Client agrees to credit {{studio_name}} when using images publicly.

PAYMENT
Commercial licensing fees are as previously agreed and are non-refundable.

INDEMNIFICATION
Client agrees to indemnify Photographer against any claims arising from Client''s use of the licensed images.

By signing below, Client confirms they have read and agree to these terms.

___

Client Signature: {{client_name}}
Date: {{sign_date}}'
    );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'seed_default_contract_templates error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger to photographers INSERT
CREATE TRIGGER on_photographer_created_seed_contract_templates
  AFTER INSERT ON photographers
  FOR EACH ROW
  EXECUTE FUNCTION seed_default_contract_templates();

-- Seed contract templates for the existing photographer (Nick)
INSERT INTO contract_templates (photographer_id, name, body)
SELECT
  id,
  'Portrait Session Agreement',
  'PORTRAIT SESSION AGREEMENT

This agreement is entered into between {{photographer_name}} / {{studio_name}} ("Photographer") and {{client_name}} ("Client") on {{today_date}}.

SESSION DETAILS
Gallery: {{gallery_title}}
Event Date: {{event_date}}

SERVICES
Photographer agrees to provide portrait photography services for the session described above. Photographer will deliver edited digital images via an online gallery within the agreed-upon timeframe.

PAYMENT
Client agrees to pay the session fee as previously discussed. Payment is due prior to or at the time of the session.

IMAGE DELIVERY
Final images will be delivered via a private online gallery. Client will receive instructions for downloading images. Images are retained for 90 days after delivery.

COPYRIGHT & USAGE
Photographer retains full copyright to all images produced during this session. Client receives a personal-use license for the delivered images, including printing and sharing on personal social media with photographer credit. Commercial use requires a separate written agreement.

MODEL RELEASE
Client grants Photographer permission to use session images for portfolio, website, and promotional purposes. If Client does not consent to this use, Client must notify Photographer in writing prior to the session.

CANCELLATION
Cancellations made less than 48 hours before the session may forfeit the session fee. Photographer will make reasonable efforts to reschedule.

LIMITATION OF LIABILITY
Photographer''s liability is limited to the session fee paid. Photographer is not liable for equipment failure, illness, or acts of nature that prevent completion of services.

By signing below, Client confirms they have read and agree to these terms.

___

Client Signature: {{client_name}}
Date: {{sign_date}}'
FROM photographers
WHERE id = 'c35ba281-3f52-48bc-8e01-df2932957ebc'
ON CONFLICT DO NOTHING;

INSERT INTO contract_templates (photographer_id, name, body)
SELECT
  id,
  'Event Photography Agreement',
  'EVENT PHOTOGRAPHY AGREEMENT

This agreement is entered into between {{photographer_name}} / {{studio_name}} ("Photographer") and {{client_name}} ("Client") on {{today_date}}.

EVENT DETAILS
Event: {{gallery_title}}
Event Date: {{event_date}}
Client Email: {{client_email}}

SERVICES
Photographer agrees to provide event photography coverage as discussed. Coverage includes candid and posed photographs of the event as opportunities arise.

PAYMENT
Client agrees to pay the agreed fee. A non-refundable retainer is due upon signing, with the balance due prior to the event date.

IMAGE DELIVERY
Edited images will be delivered within the agreed-upon timeframe following the event via a private online gallery.

COPYRIGHT & USAGE
Photographer retains copyright to all images. Client receives a personal-use license for delivered images. Commercial licensing available separately.

CANCELLATION & RESCHEDULING
If Client cancels or reschedules less than 7 days before the event, the retainer is forfeited. Photographer will make reasonable efforts to accommodate rescheduling.

FORCE MAJEURE
Neither party is liable for failure to perform due to circumstances beyond their reasonable control.

By signing below, Client confirms they have read and agree to these terms.

___

Client Signature: {{client_name}}
Date: {{sign_date}}'
FROM photographers
WHERE id = 'c35ba281-3f52-48bc-8e01-df2932957ebc'
ON CONFLICT DO NOTHING;

INSERT INTO contract_templates (photographer_id, name, body)
SELECT
  id,
  'Commercial Usage License',
  'COMMERCIAL PHOTOGRAPHY LICENSE AGREEMENT

This agreement is entered into between {{photographer_name}} / {{studio_name}} ("Photographer/Licensor") and {{client_name}} ("Client/Licensee") on {{today_date}}.

IMAGES LICENSED
Gallery: {{gallery_title}}
This license covers the images delivered as part of the above-referenced gallery or session.

GRANT OF LICENSE
Photographer grants Client a non-exclusive, non-transferable commercial license to use the licensed images for the following purposes:
- Advertising and marketing materials
- Website and digital use
- Print materials including brochures, banners, and signage
- Social media (commercial accounts)

RESTRICTIONS
Client may not sublicense, resell, or transfer these images to third parties. Client may not claim copyright over the images. Modification of images must be approved in writing.

DURATION
This license is perpetual unless otherwise specified in writing.

CREDIT
Where practical, Client agrees to credit {{studio_name}} when using images publicly.

PAYMENT
Commercial licensing fees are as previously agreed and are non-refundable.

INDEMNIFICATION
Client agrees to indemnify Photographer against any claims arising from Client''s use of the licensed images.

By signing below, Client confirms they have read and agree to these terms.

___

Client Signature: {{client_name}}
Date: {{sign_date}}'
FROM photographers
WHERE id = 'c35ba281-3f52-48bc-8e01-df2932957ebc'
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
