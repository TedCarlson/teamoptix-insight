create schema if not exists opportunity;
grant usage on schema opportunity to authenticated, service_role;

create table opportunity.analysis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  opportunity_number text,
  station_name text,
  opportunity_type text not null default 'P&D Last Mile',
  listing_location text,
  status text not null default 'DRAFT',
  source_text text not null,
  terminal_address text,
  terminal_matched_address text,
  terminal_latitude double precision,
  terminal_longitude double precision,
  zip_codes text[] not null default array[]::text[],
  weekly_mileage integer,
  weekly_delivery_stops integer,
  weekly_delivery_packages integer,
  weekly_pickup_stops integer,
  weekly_pickup_packages integer,
  weekly_dispatch_min integer,
  weekly_dispatch_max integer,
  negotiation_start_date date,
  contract_start_date date,
  parsed_listing jsonb not null default '{}'::jsonb,
  zip_analysis jsonb,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  updated_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_analysis_status_ck check (status in ('DRAFT','UNDER_REVIEW','READY_TO_COMPARE','PURSUED','AWARDED','DECLINED'))
);

create unique index opportunity_analysis_company_number_uq
  on opportunity.analysis(company_id, opportunity_number)
  where opportunity_number is not null;
create index opportunity_analysis_company_status_idx on opportunity.analysis(company_id, status, updated_at desc);

create trigger opportunity_analysis_touch_updated_at
before update on opportunity.analysis
for each row execute function core.set_updated_at();

alter table opportunity.analysis enable row level security;
create policy opportunity_analysis_read on opportunity.analysis for select to authenticated
  using (core.can_access_company(company_id));

create or replace function public.save_opportunity_analysis(p_company_slug text, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, core, opportunity
as $$
declare
  v_access jsonb := core.access_context();
  v_membership jsonb;
  v_company_id uuid;
  v_profile_id uuid := nullif(v_access->>'profile_id', '')::uuid;
  v_id uuid;
begin
  select c.id into v_company_id from core.companies c where c.company_slug = p_company_slug;
  select m into v_membership
  from jsonb_array_elements(coalesce(v_access->'memberships', '[]'::jsonb)) m
  where m->>'company_slug' = p_company_slug limit 1;

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (
    coalesce((v_access->>'is_platform_owner')::boolean, false)
    or (v_membership->>'membership_status' = 'active' and (
      v_membership->>'relationship_type' = 'admin'
      or coalesce(v_membership->'grants', '[]'::jsonb) ? 'opportunity_analysis'
    ))
  ) then raise exception 'Forbidden.'; end if;

  insert into opportunity.analysis (
    company_id, opportunity_number, station_name, opportunity_type, listing_location,
    source_text, terminal_address, terminal_matched_address, terminal_latitude, terminal_longitude,
    zip_codes, weekly_mileage, weekly_delivery_stops, weekly_delivery_packages,
    weekly_pickup_stops, weekly_pickup_packages, weekly_dispatch_min, weekly_dispatch_max,
    negotiation_start_date, contract_start_date, parsed_listing, zip_analysis,
    created_by_profile_id, updated_by_profile_id
  ) values (
    v_company_id, nullif(p_payload->>'opportunity_number',''), nullif(p_payload->>'station_name',''),
    coalesce(nullif(p_payload->>'opportunity_type',''),'P&D Last Mile'), nullif(p_payload->>'listing_location',''),
    coalesce(p_payload->>'source_text',''), nullif(p_payload->>'terminal_address',''),
    nullif(p_payload#>>'{zip_analysis,terminal,matched_address}',''),
    nullif(p_payload#>>'{zip_analysis,terminal,latitude}','')::double precision,
    nullif(p_payload#>>'{zip_analysis,terminal,longitude}','')::double precision,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'zip_codes','[]'::jsonb))), array[]::text[]),
    nullif(p_payload->>'weekly_mileage','')::integer,
    nullif(p_payload->>'weekly_delivery_stops','')::integer,
    nullif(p_payload->>'weekly_delivery_packages','')::integer,
    nullif(p_payload->>'weekly_pickup_stops','')::integer,
    nullif(p_payload->>'weekly_pickup_packages','')::integer,
    nullif(p_payload->>'weekly_dispatch_min','')::integer,
    nullif(p_payload->>'weekly_dispatch_max','')::integer,
    nullif(p_payload->>'negotiation_start_date','')::date,
    nullif(p_payload->>'contract_start_date','')::date,
    coalesce(p_payload->'parsed_listing','{}'::jsonb), p_payload->'zip_analysis', v_profile_id, v_profile_id
  )
  on conflict (company_id, opportunity_number) where opportunity_number is not null do update set
    station_name=excluded.station_name, opportunity_type=excluded.opportunity_type,
    listing_location=excluded.listing_location, source_text=excluded.source_text,
    terminal_address=excluded.terminal_address, terminal_matched_address=excluded.terminal_matched_address,
    terminal_latitude=excluded.terminal_latitude, terminal_longitude=excluded.terminal_longitude,
    zip_codes=excluded.zip_codes, weekly_mileage=excluded.weekly_mileage,
    weekly_delivery_stops=excluded.weekly_delivery_stops, weekly_delivery_packages=excluded.weekly_delivery_packages,
    weekly_pickup_stops=excluded.weekly_pickup_stops, weekly_pickup_packages=excluded.weekly_pickup_packages,
    weekly_dispatch_min=excluded.weekly_dispatch_min, weekly_dispatch_max=excluded.weekly_dispatch_max,
    negotiation_start_date=excluded.negotiation_start_date, contract_start_date=excluded.contract_start_date,
    parsed_listing=excluded.parsed_listing, zip_analysis=excluded.zip_analysis, updated_by_profile_id=v_profile_id
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_opportunity_analyses(p_company_slug text)
returns table (
  id uuid, opportunity_number text, station_name text, opportunity_type text, listing_location text,
  status text, zip_count integer, weekly_mileage integer, weekly_dispatch_min integer,
  weekly_dispatch_max integer, contract_start_date date, updated_at timestamptz
)
language sql stable security definer set search_path = public, core, opportunity
as $$
  select a.id, a.opportunity_number, a.station_name, a.opportunity_type, a.listing_location,
    a.status, cardinality(a.zip_codes), a.weekly_mileage, a.weekly_dispatch_min,
    a.weekly_dispatch_max, a.contract_start_date, a.updated_at
  from opportunity.analysis a join core.companies c on c.id=a.company_id
  where c.company_slug=p_company_slug and (
    core.is_platform_owner() or core.can_admin_company(a.company_id) or exists (
      select 1 from core.company_memberships cm join core.company_user_grant g
        on g.company_id=cm.company_id and g.profile_id=cm.profile_id
      where cm.company_id=a.company_id and cm.profile_id=core.current_profile_id()
        and cm.membership_status='active' and g.grant_key='opportunity_analysis' and g.is_active
    )
  ) order by a.updated_at desc;
$$;

create or replace function public.get_opportunity_analysis(p_company_slug text, p_opportunity_id uuid)
returns jsonb
language sql stable security definer set search_path = public, core, opportunity
as $$
  select to_jsonb(a) from opportunity.analysis a join core.companies c on c.id=a.company_id
  where c.company_slug=p_company_slug and a.id=p_opportunity_id and (
    core.is_platform_owner() or core.can_admin_company(a.company_id) or exists (
      select 1 from core.company_memberships cm join core.company_user_grant g
        on g.company_id=cm.company_id and g.profile_id=cm.profile_id
      where cm.company_id=a.company_id and cm.profile_id=core.current_profile_id()
        and cm.membership_status='active' and g.grant_key='opportunity_analysis' and g.is_active
    )
  );
$$;

revoke all on function public.save_opportunity_analysis(text,jsonb) from public;
revoke all on function public.list_opportunity_analyses(text) from public;
revoke all on function public.get_opportunity_analysis(text,uuid) from public;
grant execute on function public.save_opportunity_analysis(text,jsonb) to authenticated, service_role;
grant execute on function public.list_opportunity_analyses(text) to authenticated, service_role;
grant execute on function public.get_opportunity_analysis(text,uuid) to authenticated, service_role;
