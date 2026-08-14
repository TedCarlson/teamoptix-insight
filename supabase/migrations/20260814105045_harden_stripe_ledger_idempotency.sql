begin;

-- PostgREST cannot infer a partial unique index for `on_conflict`, even when
-- the proposed row satisfies the index predicate. Ordinary PostgreSQL unique
-- indexes already allow multiple null values, so full indexes preserve the
-- intended nullable semantics while making Stripe writes atomically upsertable.
create unique index if not exists billing_subscription_provider_id_upsert_uniq
  on billing.subscription (provider, provider_subscription_id);

create unique index if not exists billing_payment_invoice_upsert_uniq
  on billing.payment (provider, provider_invoice_id);

commit;
