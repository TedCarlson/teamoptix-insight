-- Event 4: ITF contractor company catalogue.
--
-- Source authority:
--   * donor public.contractor identity and contractor codes;
--   * donor 410/427 roster exports for the companies currently in scope;
--   * donor FUSE company-name variants as import aliases.
--
-- This event creates company identity only. It intentionally does not create
-- contractor locations, engagements, roster rows, or workforce assignments.
-- Relationships remain proposed until the company/location reconciliation is
-- approved and the appropriate acceptance authority is recorded.

alter table core.companies
  add column if not exists legal_name text;

alter table core.companies
  drop constraint if exists companies_legal_name_ck;

alter table core.companies
  add constraint companies_legal_name_ck check (
    legal_name is null or length(btrim(legal_name)) > 0
  );

comment on column core.companies.company_name is
  'User-facing company name used on roster, reporting, and workspace surfaces (Show as).';

comment on column core.companies.legal_name is
  'Verified registered/legal company name. Null until confirmed; never inferred from a source alias.';

create table if not exists core.company_external_alias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete restrict,
  source_system text not null,
  source_entity_type text not null default 'company',
  source_value text not null,
  source_value_normalized text generated always as (
    regexp_replace(lower(btrim(source_value)), '[^a-z0-9]+', '', 'g')
  ) stored,
  alias_kind text not null,
  created_at timestamptz not null default now(),
  constraint company_external_alias_source_ck check (
    length(btrim(source_system)) > 0
    and length(btrim(source_entity_type)) > 0
    and length(btrim(source_value)) > 0
  ),
  constraint company_external_alias_normalized_ck check (
    length(source_value_normalized) > 0
  ),
  constraint company_external_alias_kind_ck check (
    alias_kind in ('donor_catalogue', 'roster_export', 'fuse_onboarding', 'manual')
  ),
  constraint company_external_alias_source_uk unique (
    source_system,
    source_entity_type,
    source_value_normalized
  )
);

create index if not exists company_external_alias_company_idx
  on core.company_external_alias (company_id, source_system, alias_kind);

alter table core.company_external_alias enable row level security;

drop policy if exists company_external_alias_platform_owner_all
  on core.company_external_alias;

create policy company_external_alias_platform_owner_all
on core.company_external_alias
for all to authenticated
using ((select core.is_platform_owner()))
with check ((select core.is_platform_owner()));

revoke all on table core.company_external_alias from public, anon, authenticated;

insert into core.companies (
  company_name,
  company_slug,
  company_status,
  provisioning_status,
  contact_email
)
select
  seed.roster_name,
  seed.company_slug,
  'active',
  'provisioned',
  null
from (
  values
    ('BR Underground', 'br-underground'),
    ('Cable Warriors', 'cable-warriors'),
    ('Conex', 'conex'),
    ('General Cable', 'general-cable'),
    ('Grand Trade', 'grand-trade'),
    ('HighTek Contracting', 'hightek-contracting'),
    ('J&L Unlimited', 'j-l-unlimited'),
    ('JComm', 'jcomm'),
    ('Leon Cable', 'leon-cable'),
    ('Mold Cable', 'mold-cable'),
    ('North Cable USA', 'north-cable-usa'),
    ('Regiistek', 'regiistek'),
    ('Sigma', 'sigma'),
    ('Smart Cable Tech LLC', 'smart-cable-tech'),
    ('St. Victor Services', 'st-victor-services'),
    ('Star Communications', 'star-communications'),
    ('Terokar LLC', 'terokar'),
    ('Video Installation Pros', 'video-installation-pros'),
    ('WIFIRENET', 'wifirenet'),
    ('WYRI', 'wyri')
) as seed (roster_name, company_slug)
on conflict (company_slug) do update
set
  company_status = 'active',
  archived_at = null,
  updated_at = now();

insert into core.company_external_reference (
  company_id,
  source_system,
  source_entity_type,
  source_record_id,
  source_code
)
select
  company.id,
  'itg-insight',
  'contractor',
  seed.contractor_id,
  seed.contractor_code
from (
  values
    ('br-underground', '515f6422-0bcc-4c34-88df-3eb21d4d545b', 'BRU'),
    ('cable-warriors', '8680e892-10cd-4f82-b622-d4a6eb96af71', 'CWR'),
    ('conex', 'ccbb13d1-e285-464f-9b07-d951472fb30f', 'CNX'),
    ('general-cable', '0ab55cd1-d5ef-49da-87fd-b3ca643ccca1', 'GEN'),
    ('grand-trade', '86a31107-bbc5-476a-99a1-c31715091a1d', 'GTC'),
    ('hightek-contracting', 'ff62796a-d7ca-4e64-a99d-cf1260e56f2f', 'HTC'),
    ('j-l-unlimited', '50b40c76-f927-4ddf-824b-e13277ecbf29', 'JLU'),
    ('jcomm', 'cda0152a-52de-47b1-bd77-405d2963b22c', 'JCM'),
    ('leon-cable', '48e446b8-c132-4350-912c-4095e6203e9b', 'LNC'),
    ('mold-cable', 'fb9d1359-6dc6-41c1-84da-3c408c05d65f', 'MLD'),
    ('north-cable-usa', 'dd4d21df-b408-4c61-bf41-223b62259060', 'NCU'),
    ('regiistek', 'b8fdeb17-7865-48a1-8b4c-5f3e020009dc', 'REG'),
    ('sigma', '1b00e60a-c246-4455-bc10-284aa49df142', 'SIG'),
    ('smart-cable-tech', 'ed6152ce-e6f6-4eb4-963c-c0edf21dbeaf', 'SCT'),
    ('st-victor-services', '8a5fbc76-2554-4987-96f6-1f9fb9c675b0', 'SVS'),
    ('star-communications', '2fa05184-e783-48ca-aa1f-029ad77817e7', 'STR'),
    ('terokar', '1a4f0fac-2246-4b35-9423-c2ccc38cc7c2', 'TKR'),
    ('video-installation-pros', '65eb6a17-4cf2-4733-8c25-598c603d236d', 'VIP'),
    ('wifirenet', '26332e95-5413-44fd-868a-bf6bb296990a', 'WFN'),
    ('wyri', 'bafc8e74-84b5-471e-b8af-b9acbd253693', 'WYR')
) as seed (company_slug, contractor_id, contractor_code)
join core.companies company
  on company.company_slug = seed.company_slug
on conflict (source_system, source_entity_type, source_record_id) do update
set
  company_id = excluded.company_id,
  source_code = excluded.source_code;

insert into core.company_external_alias (
  company_id,
  source_system,
  source_entity_type,
  source_value,
  alias_kind
)
select
  company.id,
  seed.source_system,
  'company',
  seed.source_value,
  seed.alias_kind
from (
  values
    ('br-underground', 'itg-insight', 'BR Underground', 'donor_catalogue'),
    ('cable-warriors', 'itg-insight', 'Cable Warriors', 'donor_catalogue'),
    ('conex', 'itg-insight', 'Conex', 'donor_catalogue'),
    ('general-cable', 'itg-insight', 'General Cable', 'donor_catalogue'),
    ('grand-trade', 'itg-insight', 'Grand Trade', 'donor_catalogue'),
    ('hightek-contracting', 'itg-insight', 'HighTek Contracting', 'donor_catalogue'),
    ('j-l-unlimited', 'itg-insight', 'J&L Unlimited', 'donor_catalogue'),
    ('jcomm', 'itg-insight', 'JComm', 'donor_catalogue'),
    ('leon-cable', 'itg-insight', 'Leon Cable', 'donor_catalogue'),
    ('mold-cable', 'itg-insight', 'Mold Cable', 'donor_catalogue'),
    ('north-cable-usa', 'itg-insight', 'North Cable USA', 'donor_catalogue'),
    ('regiistek', 'itg-insight', 'Regiistek', 'donor_catalogue'),
    ('sigma', 'itg-insight', 'Sigma', 'donor_catalogue'),
    ('smart-cable-tech', 'itg-insight', 'Smart Cable Tech LLC', 'donor_catalogue'),
    ('st-victor-services', 'itg-insight', 'St. Victor Services', 'donor_catalogue'),
    ('star-communications', 'itg-insight', 'Star Communications', 'donor_catalogue'),
    ('terokar', 'itg-insight', 'Terokar LLC', 'donor_catalogue'),
    ('video-installation-pros', 'itg-insight', 'Video Installation Pros', 'donor_catalogue'),
    ('wifirenet', 'itg-insight', 'WIFIRENET', 'donor_catalogue'),
    ('wyri', 'itg-insight', 'WYRI', 'donor_catalogue'),

    ('br-underground', 'itg-roster-export', 'BR Underground', 'roster_export'),
    ('cable-warriors', 'itg-roster-export', 'Cable Warriors', 'roster_export'),
    ('conex', 'itg-roster-export', 'Conex', 'roster_export'),
    ('general-cable', 'itg-roster-export', 'General Cable', 'roster_export'),
    ('grand-trade', 'itg-roster-export', 'Grand Trade', 'roster_export'),
    ('hightek-contracting', 'itg-roster-export', 'HighTek Contracting', 'roster_export'),
    ('j-l-unlimited', 'itg-roster-export', 'J&L Unlimited', 'roster_export'),
    ('jcomm', 'itg-roster-export', 'JComm', 'roster_export'),
    ('leon-cable', 'itg-roster-export', 'Leon Cable', 'roster_export'),
    ('mold-cable', 'itg-roster-export', 'Mold Cable', 'roster_export'),
    ('north-cable-usa', 'itg-roster-export', 'North Cable USA', 'roster_export'),
    ('regiistek', 'itg-roster-export', 'Regiistek', 'roster_export'),
    ('sigma', 'itg-roster-export', 'Sigma', 'roster_export'),
    ('smart-cable-tech', 'itg-roster-export', 'Smart Cable Tech LLC', 'roster_export'),
    ('st-victor-services', 'itg-roster-export', 'St. Victor Services', 'roster_export'),
    ('star-communications', 'itg-roster-export', 'Star Communications', 'roster_export'),
    ('terokar', 'itg-roster-export', 'Terokar LLC', 'roster_export'),
    ('video-installation-pros', 'itg-roster-export', 'Video Installation Pros', 'roster_export'),
    ('wifirenet', 'itg-roster-export', 'WIFIRENET', 'roster_export'),
    ('wyri', 'itg-roster-export', 'WYRI', 'roster_export'),

    ('j-l-unlimited', 'fuse-onboarding', 'J&L Unlimited Contracting LLC', 'fuse_onboarding'),
    ('jcomm', 'fuse-onboarding', 'Jcomm', 'fuse_onboarding'),
    ('mold-cable', 'fuse-onboarding', 'Mold Cable INC', 'fuse_onboarding'),
    ('north-cable-usa', 'fuse-onboarding', 'North Cable USA', 'fuse_onboarding'),
    ('star-communications', 'fuse-onboarding', 'Star Communications', 'fuse_onboarding'),
    ('terokar', 'fuse-onboarding', 'Terokar LLC', 'fuse_onboarding'),
    ('video-installation-pros', 'fuse-onboarding', 'VIP VIDEO INSTALLATION PROS', 'fuse_onboarding'),
    ('wifirenet', 'fuse-onboarding', 'WIFIRENET INC', 'fuse_onboarding')
) as seed (company_slug, source_system, source_value, alias_kind)
join core.companies company
  on company.company_slug = seed.company_slug
on conflict (source_system, source_entity_type, source_value_normalized) do update
set
  company_id = excluded.company_id,
  source_value = excluded.source_value,
  alias_kind = excluded.alias_kind;

insert into core.company_product (
  company_id,
  product_id,
  participation_status,
  starts_on
)
select
  company.id,
  product.id,
  'review',
  seed.starts_on
from (
  values
    ('br-underground', date '2025-12-22'),
    ('cable-warriors', date '2026-05-22'),
    ('conex', date '2026-06-04'),
    ('general-cable', date '2025-12-22'),
    ('grand-trade', date '2025-12-22'),
    ('hightek-contracting', date '2025-12-22'),
    ('j-l-unlimited', date '2025-12-22'),
    ('jcomm', date '2025-12-22'),
    ('leon-cable', date '2025-12-22'),
    ('mold-cable', date '2025-12-22'),
    ('north-cable-usa', date '2026-06-22'),
    ('regiistek', date '2025-12-22'),
    ('sigma', date '2025-12-22'),
    ('smart-cable-tech', date '2026-06-13'),
    ('st-victor-services', date '2026-08-03'),
    ('star-communications', date '2025-12-22'),
    ('terokar', date '2026-08-13'),
    ('video-installation-pros', date '2025-12-22'),
    ('wifirenet', date '2025-12-22'),
    ('wyri', date '2025-12-22')
) as seed (company_slug, starts_on)
join core.companies company
  on company.company_slug = seed.company_slug
join ref.insight_products product
  on product.product_key = 'insight-telecom-fulfillment'
on conflict (company_id, product_id) do update
set
  participation_status = case
    when core.company_product.participation_status = 'active' then 'active'
    else excluded.participation_status
  end,
  starts_on = coalesce(core.company_product.starts_on, excluded.starts_on),
  ends_on = null,
  updated_at = now();

insert into core.company_relationship (
  principal_company_id,
  provider_company_id,
  relationship_kind,
  relationship_status,
  is_exclusive,
  starts_on
)
select
  itg.id,
  provider.id,
  'subcontractor',
  'proposed',
  false,
  seed.starts_on
from (
  values
    ('br-underground', date '2025-12-22'),
    ('cable-warriors', date '2026-05-22'),
    ('conex', date '2026-06-04'),
    ('general-cable', date '2025-12-22'),
    ('grand-trade', date '2025-12-22'),
    ('hightek-contracting', date '2025-12-22'),
    ('j-l-unlimited', date '2025-12-22'),
    ('jcomm', date '2025-12-22'),
    ('leon-cable', date '2025-12-22'),
    ('mold-cable', date '2025-12-22'),
    ('north-cable-usa', date '2026-06-22'),
    ('regiistek', date '2025-12-22'),
    ('sigma', date '2025-12-22'),
    ('smart-cable-tech', date '2026-06-13'),
    ('st-victor-services', date '2026-08-03'),
    ('star-communications', date '2025-12-22'),
    ('terokar', date '2026-08-13'),
    ('video-installation-pros', date '2025-12-22'),
    ('wifirenet', date '2025-12-22'),
    ('wyri', date '2025-12-22')
) as seed (company_slug, starts_on)
join core.companies itg
  on itg.company_slug = 'integrated-tech-group'
join core.companies provider
  on provider.company_slug = seed.company_slug
on conflict (principal_company_id, provider_company_id, relationship_kind)
where relationship_status in ('proposed', 'active', 'suspended')
do update
set
  starts_on = coalesce(core.company_relationship.starts_on, excluded.starts_on),
  updated_at = now();

create or replace function public.itf_company_catalogue()
returns table (
  company_id uuid,
  roster_name text,
  legal_name text,
  company_slug text,
  provisioning_status text,
  donor_contractor_id text,
  donor_contractor_code text,
  donor_contractor_name text,
  product_status text,
  relationship_status text,
  source_aliases text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select core.is_platform_owner()) then
    raise exception 'Platform owner access required.' using errcode = '42501';
  end if;

  return query
  select
    company.id,
    company.company_name,
    company.legal_name,
    company.company_slug,
    company.provisioning_status,
    donor.source_record_id,
    donor.source_code,
    donor_alias.source_value,
    company_product.participation_status,
    relationship.relationship_status,
    coalesce(alias_values.source_aliases, '{}'::text[])
  from core.companies company
  join core.company_product company_product
    on company_product.company_id = company.id
  join ref.insight_products product
    on product.id = company_product.product_id
   and product.product_key = 'insight-telecom-fulfillment'
  left join core.company_external_reference donor
    on donor.company_id = company.id
   and donor.source_system = 'itg-insight'
   and donor.source_entity_type = 'contractor'
  left join core.company_external_alias donor_alias
    on donor_alias.company_id = company.id
   and donor_alias.source_system = 'itg-insight'
   and donor_alias.alias_kind = 'donor_catalogue'
  left join core.company_relationship relationship
    on relationship.provider_company_id = company.id
   and relationship.relationship_kind = 'subcontractor'
   and relationship.relationship_status in ('proposed', 'active', 'suspended')
   and relationship.principal_company_id = (
     select itg.id
     from core.companies itg
     where itg.company_slug = 'integrated-tech-group'
   )
  left join lateral (
    select array_agg(alias.source_value order by alias.source_system, alias.source_value)
      as source_aliases
    from core.company_external_alias alias
    where alias.company_id = company.id
  ) alias_values on true
  where company.company_status = 'active'
  order by company.company_name;
end;
$$;

revoke all on function public.itf_company_catalogue() from public, anon;
grant execute on function public.itf_company_catalogue() to authenticated;

comment on function public.itf_company_catalogue() is
  'Platform-owner review projection for ITF company identity and donor aliases. It does not expose roster rows.';

-- Preserve the existing platform product/company seam while adding the
-- separately verified legal name to company details.
drop function if exists public.platform_product_companies(text);

create function public.platform_product_companies(p_product_key text)
returns table (
  id uuid,
  company_name text,
  legal_name text,
  company_slug text,
  company_status text,
  provisioning_status text,
  participation_status text,
  location_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select core.is_platform_owner()) then
    raise exception 'Platform owner access required.' using errcode = '42501';
  end if;

  return query
  select
    company.id,
    company.company_name,
    company.legal_name,
    company.company_slug,
    company.company_status,
    company.provisioning_status,
    company_product.participation_status,
    count(product_location.company_location_id) filter (
      where product_location.location_status = 'active'
    ) as location_count
  from ref.insight_products product
  join core.company_product company_product
    on company_product.product_id = product.id
   and company_product.participation_status in ('active', 'review', 'planned')
  join core.companies company
    on company.id = company_product.company_id
   and company.company_status = 'active'
  left join core.company_product_location product_location
    on product_location.company_id = company_product.company_id
   and product_location.product_id = company_product.product_id
  where product.product_key = lower(btrim(p_product_key))
    and product.is_active
  group by
    company.id,
    company.company_name,
    company.legal_name,
    company.company_slug,
    company.company_status,
    company.provisioning_status,
    company_product.participation_status
  order by company.company_name;
end;
$$;

revoke all on function public.platform_product_companies(text) from public, anon;
grant execute on function public.platform_product_companies(text) to authenticated;

comment on function public.platform_product_companies(text) is
  'Platform-owner product company selector. company_name is Show as; legal_name is separately verified.';
