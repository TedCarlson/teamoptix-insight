-- Read-only verification for the first live invoice/payment audit chain and
-- the durable Team Optix finance ledger foundation.

do $$
declare
  v_company_id constant uuid := '0385bc8f-eb13-490b-92c8-f34bad2507df';
  v_invoice_id uuid;
begin
  select invoice.id
  into strict v_invoice_id
  from billing.invoice invoice
  where invoice.company_id = v_company_id
    and invoice.provider_invoice_id = 'in_1TzdqDJeXupVRq0Vbh1GYYjk'
    and invoice.invoice_number = 'WNBGLHVU-0001'
    and invoice.provider_livemode is true
    and invoice.invoice_status = 'paid'
    and invoice.amount_due = 398.00
    and invoice.amount_paid = 398.00
    and invoice.amount_remaining = 0.00;

  if not exists (
    select 1
    from billing.payment payment
    where payment.company_id = v_company_id
      and payment.invoice_id = v_invoice_id
      and payment.provider_checkout_session_id = 'cs_live_a1eY9XiZBY4u7mYN77gweVmguQO97BSaTxGxQGH7KsprMe1KY8TD5KvO2j'
      and payment.provider_payment_intent_id = 'pi_3TzdqAJeXupVRq0V1qMZM1RH'
      and payment.provider_charge_id = 'ch_3TzdqAJeXupVRq0V1EbNTJBN'
      and payment.provider_invoice_id = 'in_1TzdqDJeXupVRq0Vbh1GYYjk'
      and payment.provider_livemode is true
      and payment.payment_status = 'paid'
      and payment.amount = 398.00
      and payment.amount_refunded = 0.00
      and payment.receipt_url is not null
  ) then
    raise exception 'Verified Beacon Point payment evidence is incomplete';
  end if;

  if (
    select count(*)
    from billing.provider_event event
    where event.company_id = v_company_id
      and event.provider_livemode is true
      and event.processing_status = 'processed'
      and event.provider_event_id in (
        'evt_1TzdqGJeXupVRq0VecM4fcdk',
        'evt_1TzdqIJeXupVRq0VS2DlTMfl',
        'evt_1TzdqIJeXupVRq0VFxi4XV6I',
        'evt_1TzdqIJeXupVRq0VOy5ENaVn',
        'evt_1TzdqHJeXupVRq0ViaTeOy03',
        'evt_1TzdqHJeXupVRq0V4V9ZFSLC',
        'evt_3TzdqAJeXupVRq0V1O5UVC6D',
        'evt_3TzdqAJeXupVRq0V1qfnU1o3'
      )
  ) <> 8 then
    raise exception 'The verified Stripe event chain is incomplete';
  end if;

  if not exists (
    select 1
    from commercial.company_activation_readiness readiness
    where readiness.company_id = v_company_id
      and readiness.readiness_key = 'implementation_payment_ready'
      and readiness.status = 'ready'
      and readiness.metadata ->> 'provider_invoice_id' = 'in_1TzdqDJeXupVRq0Vbh1GYYjk'
      and readiness.metadata ->> 'provider_livemode' = 'true'
  ) then
    raise exception 'Implementation payment readiness is not linked to the verified live invoice';
  end if;

  if exists (
    select 1
    from billing.provider_event event
    where event.processing_status = 'failed'
  ) then
    raise exception 'Finance provider event ledger contains failed events';
  end if;
end;
$$;
