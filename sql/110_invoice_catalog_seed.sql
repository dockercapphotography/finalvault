-- 110_invoice_catalog_seed.sql
-- v1.6.0 Invoicing, part 4 of 4: starter invoice catalog.
--
-- Every photographer gets 12 generic items (names and descriptions from the
-- v1.6.0 scope). Prices start at $0 because the seed can't know anyone's
-- rates. Travel and venue fees are pass-through costs, so they default to
-- non-taxable. Follows the review-template seed: a seed function, a signup
-- trigger whose wrapper logs and never blocks signup, and a backfill.

begin;

create or replace function public.seed_default_invoice_catalog(p_photographer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Safe to re-run: does nothing once a photographer has any catalog item.
  if exists (select 1 from invoice_catalog_items where photographer_id = p_photographer_id) then
    return;
  end if;

  insert into invoice_catalog_items
    (photographer_id, sort_order, name, description, unit_label, taxable_default)
  values
    (p_photographer_id,  1, 'Session Fee',
      'Covers the photographer''s time, talent, and equipment for the scheduled session or event.', null, true),
    (p_photographer_id,  2, 'Retainer / Deposit',
      'A non-refundable deposit paid to reserve the photographer''s date and time. Applied toward the total balance due.', null, true),
    (p_photographer_id,  3, 'Travel Fee',
      'Covers mileage, transportation, and time spent traveling to and from the shoot location.', 'mi', false),
    (p_photographer_id,  4, 'Editing / Retouching',
      'Post-production work including color correction, exposure adjustment, and standard retouching on delivered images.', null, true),
    (p_photographer_id,  5, 'Rush Editing / Delivery',
      'Expedited turnaround on final edited images, ahead of the standard delivery timeline.', null, true),
    (p_photographer_id,  6, 'Additional Hour',
      'Extra coverage time beyond what was included in the original session or package.', 'hr', true),
    (p_photographer_id,  7, 'Second Shooter / Assistant',
      'An additional photographer or assistant present to provide extra coverage angles or support during the shoot.', null, true),
    (p_photographer_id,  8, 'Location / Venue Fee',
      'A fee charged by the shoot location or venue, passed through to the client.', null, false),
    (p_photographer_id,  9, 'Print Release / Usage License',
      'Grants the client rights to print and reproduce their images for personal or specified commercial use.', null, true),
    (p_photographer_id, 10, 'Reshoot Fee',
      'Covers a follow-up session scheduled to redo or supplement a previous shoot.', null, true),
    (p_photographer_id, 11, 'Late Booking Fee',
      'Applied when a session is booked within a short window of the requested date.', null, true),
    (p_photographer_id, 12, 'Cancellation / Rescheduling Fee',
      'Applied when a booked session is cancelled or rescheduled outside the agreed notice period.', null, true);
end $$;

-- SECURITY DEFINER and takes any photographer id, so no API caller may run it.
revoke all on function public.seed_default_invoice_catalog(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_invoice_catalog(uuid) to service_role;

create or replace function public.seed_invoice_catalog_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform seed_default_invoice_catalog(new.id);
  return new;
exception when others then
  raise log 'seed_invoice_catalog_on_signup error for %: %', new.id, sqlerrm;
  return new;
end $$;

create trigger on_photographer_created_seed_invoice_catalog
  after insert on public.photographers
  for each row execute function public.seed_invoice_catalog_on_signup();

-- Existing photographers
select public.seed_default_invoice_catalog(id) from public.photographers;

commit;

-- ── Rollback ─────────────────────────────────────────────────────────────
-- Removes the trigger and functions. Catalog rows stay; delete unused ones
-- by hand if needed (used ones are referenced by line items).
-- begin;
-- drop trigger if exists on_photographer_created_seed_invoice_catalog on public.photographers;
-- drop function if exists public.seed_invoice_catalog_on_signup(), public.seed_default_invoice_catalog(uuid);
-- commit;
